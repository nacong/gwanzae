"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TrackingPhase = "idle" | "waiting" | "driving" | "working" | "unavailable" | "stopped";

export type WorkTrackingSnapshot = {
  phase: TrackingPhase;
  startedAt: number | null;
  completedAt: number | null;
  totalSeconds: number;
  workSeconds: number | null;
  drivingSeconds: number;
  unknownSeconds: number;
  sampleCount: number;
  rejectedCount: number;
  lastSpeedKmh: number | null;
  quality: "unavailable" | "poor" | "estimated";
  message: string;
};

type Fix = { lat: number; lng: number; at: number };

type TrackerInternal = {
  startedAt: number | null;
  completedAt: number | null;
  phase: TrackingPhase;
  phaseStartedAt: number | null;
  accumulatedWorkMs: number;
  accumulatedDrivingMs: number;
  highSpeedSince: number | null;
  lowSpeedSince: number | null;
  vehicleDetected: boolean;
  sampleCount: number;
  rejectedCount: number;
  lastSpeedKmh: number | null;
  previousFix: Fix | null;
  errorMessage: string | null;
};

// 웹 MVP 기본값. 실제 운행 로그와 수동 현장 시작/종료 기록을 대조해 조정한다.
const ENTER_DRIVING_MPS = 3.5; // 약 12.6km/h
const EXIT_DRIVING_MPS = 1.4;  // 약 5.0km/h
const ENTER_SUSTAIN_MS = 8_000;
const EXIT_SUSTAIN_MS = 30_000;
const MAX_ACCEPTED_ACCURACY_M = 100;

const EMPTY_SNAPSHOT: WorkTrackingSnapshot = {
  phase: "idle",
  startedAt: null,
  completedAt: null,
  totalSeconds: 0,
  workSeconds: null,
  drivingSeconds: 0,
  unknownSeconds: 0,
  sampleCount: 0,
  rejectedCount: 0,
  lastSpeedKmh: null,
  quality: "unavailable",
  message: "위치 측정 대기 중",
};

function distanceMeters(a: Fix, b: Fix): number {
  const radius = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function snapshotOf(state: TrackerInternal, now = Date.now()): WorkTrackingSnapshot {
  if (state.startedAt == null) return EMPTY_SNAPSHOT;
  const end = state.completedAt ?? now;
  const totalMs = Math.max(0, end - state.startedAt);
  let workMs = state.accumulatedWorkMs;
  let drivingMs = state.accumulatedDrivingMs;

  if (state.phaseStartedAt != null) {
    if (state.phase === "working") workMs += Math.max(0, end - state.phaseStartedAt);
    if (state.phase === "driving") drivingMs += Math.max(0, end - state.phaseStartedAt);
  }

  const measuredMs = Math.min(totalMs, workMs + drivingMs);
  const workSeconds = state.vehicleDetected ? Math.round(workMs / 1000) : null;
  const quality = state.sampleCount === 0
    ? "unavailable"
    : state.errorMessage || state.rejectedCount > state.sampleCount || state.sampleCount < 3
      ? "poor"
      : "estimated";
  const messages: Record<TrackingPhase, string> = {
    idle: "위치 측정 대기 중",
    waiting: "차량 출발을 감지하는 중",
    driving: "차량 이동으로 추정 중",
    working: "현장 작업시간 측정 중",
    unavailable: state.errorMessage ?? "위치 정보를 사용할 수 없음",
    stopped: quality === "unavailable" ? "작업시간 측정 불가" : "작업시간 측정 완료",
  };

  return {
    phase: state.phase,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    totalSeconds: Math.round(totalMs / 1000),
    workSeconds,
    drivingSeconds: Math.round(drivingMs / 1000),
    unknownSeconds: Math.round(Math.max(0, totalMs - measuredMs) / 1000),
    sampleCount: state.sampleCount,
    rejectedCount: state.rejectedCount,
    lastSpeedKmh: state.lastSpeedKmh,
    quality,
    message: messages[state.phase],
  };
}

export function useWebWorkTracker(startedAt: number | null) {
  const watchIdRef = useRef<number | null>(null);
  const stateRef = useRef<TrackerInternal>({
    startedAt: null,
    completedAt: null,
    phase: "idle",
    phaseStartedAt: null,
    accumulatedWorkMs: 0,
    accumulatedDrivingMs: 0,
    highSpeedSince: null,
    lowSpeedSince: null,
    vehicleDetected: false,
    sampleCount: 0,
    rejectedCount: 0,
    lastSpeedKmh: null,
    previousFix: null,
    errorMessage: null,
  });
  const [snapshot, setSnapshot] = useState<WorkTrackingSnapshot>(EMPTY_SNAPSHOT);

  const publish = useCallback(() => setSnapshot(snapshotOf(stateRef.current)), []);

  const stop = useCallback((): WorkTrackingSnapshot => {
    const state = stateRef.current;
    if (watchIdRef.current != null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (state.completedAt == null) {
      const now = Date.now();
      if (state.phaseStartedAt != null) {
        if (state.phase === "working") state.accumulatedWorkMs += Math.max(0, now - state.phaseStartedAt);
        if (state.phase === "driving") state.accumulatedDrivingMs += Math.max(0, now - state.phaseStartedAt);
      }
      state.completedAt = now;
      state.phaseStartedAt = null;
      state.phase = "stopped";
    }
    const finalSnapshot = snapshotOf(state, state.completedAt);
    setSnapshot(finalSnapshot);
    return finalSnapshot;
  }, []);

  useEffect(() => {
    if (startedAt == null || startedAt <= 0) return;
    const state = stateRef.current;
    state.startedAt = startedAt;
    state.phase = "waiting";
    state.phaseStartedAt = startedAt;
    state.completedAt = null;
    publish();

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      state.phase = "unavailable";
      state.errorMessage = "이 브라우저는 위치 측정을 지원하지 않음";
      publish();
      return;
    }

    function onPosition(position: GeolocationPosition) {
      const current = stateRef.current;
      if (current.completedAt != null) return;
      const { accuracy, latitude, longitude, speed } = position.coords;
      const at = position.timestamp || Date.now();
      if (!Number.isFinite(accuracy) || accuracy > MAX_ACCEPTED_ACCURACY_M) {
        current.rejectedCount += 1;
        publish();
        return;
      }

      const fix: Fix = { lat: latitude, lng: longitude, at };
      let speedMps = typeof speed === "number" && Number.isFinite(speed) && speed >= 0 ? speed : null;
      if (speedMps == null && current.previousFix) {
        const seconds = (fix.at - current.previousFix.at) / 1000;
        if (seconds > 0 && seconds <= 60) speedMps = distanceMeters(current.previousFix, fix) / seconds;
      }
      current.previousFix = fix;
      current.sampleCount += 1;
      current.errorMessage = null;
      // 일시적인 timeout 뒤 위치가 다시 들어오면 측정을 복구한다.
      if (current.phase === "unavailable") {
        current.phase = current.vehicleDetected ? "working" : "waiting";
        current.phaseStartedAt = at;
      }
      if (speedMps == null) {
        publish();
        return;
      }
      current.lastSpeedKmh = speedMps * 3.6;

      if (current.phase === "waiting" || current.phase === "working") {
        if (speedMps >= ENTER_DRIVING_MPS) {
          current.highSpeedSince ??= at;
          if (at - current.highSpeedSince >= ENTER_SUSTAIN_MS) {
            if (current.phase === "working" && current.phaseStartedAt != null) {
              current.accumulatedWorkMs += Math.max(0, current.highSpeedSince - current.phaseStartedAt);
            }
            current.phase = "driving";
            current.phaseStartedAt = current.highSpeedSince;
            current.vehicleDetected = true;
            current.highSpeedSince = null;
            current.lowSpeedSince = null;
          }
        } else {
          current.highSpeedSince = null;
        }
      } else if (current.phase === "driving") {
        if (speedMps <= EXIT_DRIVING_MPS) {
          current.lowSpeedSince ??= at;
          if (at - current.lowSpeedSince >= EXIT_SUSTAIN_MS) {
            if (current.phaseStartedAt != null) {
              current.accumulatedDrivingMs += Math.max(0, at - current.phaseStartedAt);
            }
            current.phase = "working";
            current.phaseStartedAt = at;
            current.lowSpeedSince = null;
            current.highSpeedSince = null;
          }
        } else {
          current.lowSpeedSince = null;
        }
      }
      publish();
    }

    function onError(error: GeolocationPositionError) {
      const current = stateRef.current;
      current.errorMessage = error.code === error.PERMISSION_DENIED
        ? "위치 권한이 없어 작업시간을 측정할 수 없음"
        : "위치 신호를 받지 못하는 중";
      if (current.sampleCount === 0) current.phase = "unavailable";
      publish();
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      maximumAge: 2_000,
      timeout: 10_000,
    });
    const ticker = window.setInterval(publish, 1_000);
    return () => {
      window.clearInterval(ticker);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, [publish, startedAt]);

  return { snapshot, stop };
}
