"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Users, Clock, CheckCircle2, X, Loader2,
  FileText, ScanLine, Truck, MapPin, AlertCircle, Navigation,
  Timer, ChevronRight, Package, ArrowRight, RefreshCw, Sparkles, LogOut, Upload,
} from "lucide-react";
import {
  cn, DispatchApplication, DispatchTimeGroup,
  getCurrentStaffStatus, StaffStatus,
} from "@/lib/utils";
import {
  confirmStaffingRecommendation, createApplicationFromOcr, dispatchConfirm, listApplications,
  optimizeRun, schedulesUpcoming, staffingRecommendationsUpcoming, trainFatigueDataset, workersStatusToday,
  updateApplication,
  type Application, type FatigueDatasetTrainingResult, type Schedule, type StaffingProposal, type WorkerTodayStatus,
} from "@/lib/api";
import { clearAuth, getStoredAuthUser } from "@/lib/auth";
import TabBar from "@/components/TabBar";

type AdminTodaySlot = {
  dispatchTime: string;
  rows: Schedule[];
  assignedWorkers: string[];
  requiredPersonnel: number;
  routeReady: boolean;
};

type WorkerCondition = {
  label: "데이터 없음" | "양호" | "주의" | "위험";
  iconSrc: string | null;
  bannerClass: string;
  textClass: string;
};

function workerCondition(borg: number | null | undefined): WorkerCondition {
  if (borg == null) {
    return { label: "데이터 없음", iconSrc: null, bannerClass: "bg-slate-100", textClass: "text-slate-500" };
  }
  if (borg >= 7) {
    return { label: "위험", iconSrc: "/figma/status-danger.svg", bannerClass: "bg-[#fee2e2]", textClass: "text-[#dc2626]" };
  }
  if (borg >= 4) {
    return { label: "주의", iconSrc: "/figma/status-caution.svg", bannerClass: "bg-[#fef3c7]", textClass: "text-[#b48200]" };
  }
  return { label: "양호", iconSrc: "/figma/status-good.svg", bannerClass: "bg-[#e1fbf0]", textClass: "text-[#059669]" };
}

function scheduleBuildingName(row: Schedule): string {
  if (row.동선?.건물명) return row.동선.건물명;
  if (row.건물명) return row.건물명;
  return row.설치장소?.split(/[\s\d]/)[0] || row.신청부서 || "미지정";
}

function groupAdminSchedules(rows: Schedule[]): AdminTodaySlot[] {
  const grouped = new Map<string, Schedule[]>();
  for (const row of rows) {
    const key = row.출동일시 ?? "미정";
    (grouped.get(key) ?? grouped.set(key, []).get(key)!).push(row);
  }
  return [...grouped.entries()].map(([dispatchTime, slotRows]) => ({
    dispatchTime,
    rows: slotRows,
    assignedWorkers: Array.from(new Set(slotRows.flatMap((row) => row.배정인원 ?? []))),
    requiredPersonnel: Math.max(
      1,
      ...slotRows.map((row) => Math.max(row.투입인원수 ?? 0, row.필요인원수 ?? 1)),
    ),
    routeReady: slotRows.every((row) => row.출동확정 === true),
  }));
}

type ScanStep = "camera" | "scanning" | "review";
type ScannedData = Omit<DispatchApplication, "id" | "status" | "createdAt" | "requiredPersonnel">;

function toScannedData(application: Application): ScannedData {
  return {
    신청번호: application.신청번호 ?? "",
    신청일자: application.신청일자 ?? "",
    신청부서: application.신청부서 ?? "",
    물품목록: (application.물품목록 ?? []).map((item) => ({
      품명: item.품명 ?? "",
      설치장소: item.설치장소 ?? "",
      수량: item.수량 ?? 1,
      필요인원수: item.필요인원수 ?? 0,
    })),
  };
}

function toPendingApplication(application: Application): DispatchApplication {
  const data = toScannedData(application);
  return {
    ...data,
    id: String(application.id),
    requiredPersonnel: Math.max(0, ...data.물품목록.map((item) => item.필요인원수)),
    status: "unoptimized",
    createdAt: Date.now(),
  };
}

export default function Home() {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffStatus>({ count: 0, label: "로딩 중..." });
  const [time, setTime] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [unoptimizedApps, setUnoptimizedApps] = useState<DispatchApplication[]>([]);
  const [timeGroups, setTimeGroups] = useState<DispatchTimeGroup[]>([]);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<ScanStep>("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<ScannedData | null>(null);
  const [scannedApplicationId, setScannedApplicationId] = useState<number | null>(null);
  const [scanSaving, setScanSaving] = useState(false);
  const [metaInput, setMetaInput] = useState({ 신청번호: "", 신청부서: "", 신청일자: "" });
  const [itemPersonnelInput, setItemPersonnelInput] = useState<Record<number, string>>({});
  const [itemNameInput, setItemNameInput] = useState<Record<number, string>>({});
  const [itemQuantityInput, setItemQuantityInput] = useState<Record<number, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [workerStatuses, setWorkerStatuses] = useState<WorkerTodayStatus[]>([]);
  const [workerStatusLoading, setWorkerStatusLoading] = useState(true);
  const [staffingProposals, setStaffingProposals] = useState<StaffingProposal[] | null>(null);
  const [staffingLoading, setStaffingLoading] = useState(false);
  const [staffingSelections, setStaffingSelections] = useState<Record<string, string[]>>({});
  const [confirmingProposal, setConfirmingProposal] = useState<string | null>(null);
  const [staffingMessage, setStaffingMessage] = useState<string | null>(null);
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [todaySchedulesLoading, setTodaySchedulesLoading] = useState(true);
  const [todaySchedulesError, setTodaySchedulesError] = useState<string | null>(null);
  const [openingDispatch, setOpeningDispatch] = useState<string | null>(null);
  const [fatigueDatasetTraining, setFatigueDatasetTraining] = useState(false);
  const [fatigueDatasetResult, setFatigueDatasetResult] = useState<FatigueDatasetTrainingResult | null>(null);
  const [fatigueDatasetError, setFatigueDatasetError] = useState<string | null>(null);

  // 출동 팝업
  const [dispatchPopup, setDispatchPopup] = useState<DispatchTimeGroup | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<unknown>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fatigueDatasetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => { setTime(new Date()); setStaff(getCurrentStaffStatus()); }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let refreshing = false;

    const refreshWorkerStatuses = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const statuses = await workersStatusToday();
        if (active) setWorkerStatuses(statuses);
      } catch (statusError) {
        console.warn("[admin] 작업자 상태 조회 실패", statusError);
      } finally {
        refreshing = false;
        if (active) setWorkerStatusLoading(false);
      }
    };

    void refreshWorkerStatuses();
    const timer = window.setInterval(() => { void refreshWorkerStatuses(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const refreshTodaySchedules = async () => {
    try {
      setTodaySchedulesError(null);
      setTodaySchedules(await schedulesUpcoming());
    } catch (scheduleError) {
      setTodaySchedulesError(String(scheduleError));
    } finally {
      setTodaySchedulesLoading(false);
    }
  };

  useEffect(() => {
    void refreshTodaySchedules();
  }, []);

  useEffect(() => {
    try {
      const g = localStorage.getItem("gwanzae-timegroups");
      if (g) {
        const parsed = JSON.parse(g);
        const valid = parsed.filter((g: { applications: DispatchApplication[] }) =>
          g.applications.every((a: DispatchApplication) => Array.isArray(a.물품목록))
        );
        setTimeGroups(valid);
      }
    } catch { /* ignore */ }
    void listApplications("접수").then((applications) => {
      const pending = applications
        .filter((application) => application.점검완료 === true)
        .map(toPendingApplication);
      setUnoptimizedApps(pending);
      localStorage.setItem("gwanzae-unoptimized", JSON.stringify(pending));
    }).catch((pendingError) => {
      console.warn("[admin] 최적화 대기 신청서 조회 실패", pendingError);
      try {
        const raw = localStorage.getItem("gwanzae-unoptimized");
        if (raw) setUnoptimizedApps(JSON.parse(raw));
      } catch { /* 로컬 폴백도 실패하면 빈 목록 유지 */ }
    });
  }, []);

  const saveUnoptimized = (apps: DispatchApplication[]) => {
    setUnoptimizedApps(apps);
    localStorage.setItem("gwanzae-unoptimized", JSON.stringify(apps));
  };
  const saveTimeGroups = (groups: DispatchTimeGroup[]) => {
    setTimeGroups(groups);
    localStorage.setItem("gwanzae-timegroups", JSON.stringify(groups));
  };

  const resetScan = () => {
    setScanStep("camera"); setScanError(null); setScannedData(null);
    setScannedApplicationId(null); setScanSaving(false);
    setMetaInput({ 신청번호: "", 신청부서: "", 신청일자: "" });
    setItemPersonnelInput({});
    setItemNameInput({});
    setItemQuantityInput({});
    setSelectedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setSelectedFiles(prev => [...prev, ...files]);
    setScanOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFatigueDatasetChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFatigueDatasetTraining(true);
    setFatigueDatasetResult(null);
    setFatigueDatasetError(null);
    try {
      const result = await trainFatigueDataset(file);
      setFatigueDatasetResult(result);
      setWorkerStatusLoading(true);
      try {
        setWorkerStatuses(await workersStatusToday());
      } catch (statusError) {
        console.warn("[admin] 학습 후 작업자 상태 새로고침 실패", statusError);
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      const detail = raw.match(/"detail"\s*:\s*"([^"]+)"/)?.[1];
      setFatigueDatasetError(detail ?? raw);
    } finally {
      setWorkerStatusLoading(false);
      setFatigueDatasetTraining(false);
    }
  };

  const handleStartScan = async () => {
    if (selectedFiles.length === 0) return;
    setScanError(null); setScanStep("scanning");
    try {
      // OCR API가 이미지 인식과 applications 저장을 함께 처리한다.
      const created = await createApplicationFromOcr(selectedFiles);
      const data = toScannedData(created);
      setScannedApplicationId(created.id);
      setScannedData(data);
      setMetaInput({ 신청번호: data.신청번호, 신청부서: data.신청부서, 신청일자: data.신청일자 });

      const inputs: Record<number, string> = {};
      const nameInputs: Record<number, string> = {};
      data.물품목록.forEach((item, i) => {
        inputs[i] = item.필요인원수 > 0 ? String(item.필요인원수) : "";
        nameInputs[i] = item.품명;
      });
      const quantityInputs: Record<number, string> = {};
      data.물품목록.forEach((item, i) => { quantityInputs[i] = String(item.수량); });
      setItemPersonnelInput(inputs);
      setItemNameInput(nameInputs);
      setItemQuantityInput(quantityInputs);
      setScanStep("review");
    } catch (err) {
      console.error("[ocr api error]", err);
      setScanError(`인식 실패: ${err instanceof Error ? err.message : String(err)}`);
      setScanStep("camera");
    }
  };

  const handleSaveApplication = async () => {
    if (!scannedData || scannedApplicationId == null || scanSaving) return;
    const updatedItems = scannedData.물품목록.map((item, i) => ({
      ...item,
      품명: (itemNameInput[i] ?? item.품명).trim() || item.품명,
      수량: parseInt(itemQuantityInput[i] ?? "", 10) || item.수량,
      필요인원수: parseInt(itemPersonnelInput[i] ?? "", 10) || item.필요인원수,
    }));
    const requiredPersonnel = Math.max(...updatedItems.map(it => it.필요인원수), 0);
    setScanSaving(true);
    setScanError(null);
    try {
      // 검토 화면에서 수정한 값과 점검 완료 상태를 OCR로 생성된 동일 신청서에 반영한다.
      await updateApplication(scannedApplicationId, {
        ...metaInput,
        물품목록: updatedItems,
        점검완료: true,
      });
      saveUnoptimized([...unoptimizedApps, {
        ...scannedData,
        ...metaInput,
        물품목록: updatedItems,
        id: String(scannedApplicationId),
        requiredPersonnel,
        status: "unoptimized",
        createdAt: Date.now(),
      }]);
      setScanOpen(false);
      resetScan();
    } catch (err) {
      setScanError(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setScanSaving(false);
    }
  };

  const handleOptimize = async () => {
    if (unoptimizedApps.length === 0 || isOptimizing) return;
    setIsOptimizing(true);

    // 1) 인증된 POST /optimize/run — 점검 완료 신청서를 서버에서 일정으로 생성
    try {
      const result = await optimizeRun();
      await Promise.all([refreshTodaySchedules(), loadStaffingPreview()]);
      // 재최적화는 schedule ID를 새로 만들므로 이전 출동 계획은 더 이상 유효하지 않다.
      sessionStorage.removeItem("gwanzae-dispatch-plan");
      sessionStorage.removeItem("gwanzae-dispatch-apps");
      sessionStorage.removeItem("gwanzae-dispatch-started-at");
      sessionStorage.removeItem("gwanzae-dispatch-session-id");
      const unassigned = new Set(result.미배정_신청서);
      saveUnoptimized(unoptimizedApps.filter((application) => unassigned.has(application.신청번호)));
      if (result.미배정_신청서.length > 0) {
        setTodaySchedulesError(`일정을 배정하지 못한 신청서: ${result.미배정_신청서.join(", ")}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[optimize/run API error]", err);
      setTodaySchedulesError(`일정 최적화 실패: ${message}`);
      setIsOptimizing(false);
      return;
    }

    setIsOptimizing(false);
  };

  /** API 응답에서 경로 배열 추출 (형식 불명확하므로 유연하게 처리) */
  function extractRoute(data: unknown): string[] | null {
    if (Array.isArray(data) && data.every(r => typeof r === "string")) return data as string[];
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      for (const key of ["route", "경로", "동선", "order", "locations", "건물순서"]) {
        const val = obj[key];
        if (Array.isArray(val) && val.every(r => typeof r === "string")) return val as string[];
      }
    }
    return null;
  }

  /** 출동 버튼 클릭 → /dispatch로 이동 (요청 데이터를 localStorage에 저장) */
  const handleDispatchClick = (group: DispatchTimeGroup) => {
    const request = {
      투입인원수: staff.count > 0 ? staff.count : null,
      신청서: group.applications.flatMap(a => a.물품목록.map(item => ({
        품명: item.품명,
        설치장소: item.설치장소,
        수량: item.수량,
        필요인원수: item.필요인원수,
      }))),
    };
    localStorage.setItem("gwanzae-dispatch-request", JSON.stringify(request));
    localStorage.setItem("gwanzae-dispatch-group-id", group.id);
    router.push("/dispatch");
  };

  /** 출동 확인 → optimizedRoute를 서버 결과로 갱신 후 isDispatched = true */
  const confirmDispatch = (groupId: string) => {
    const serverRoute = extractRoute(routeData);
    saveTimeGroups(timeGroups.map(g =>
      g.id !== groupId ? g : {
        ...g,
        isDispatched: true,
        optimizedRoute: serverRoute ?? g.optimizedRoute,
      }
    ));
    setDispatchPopup(null);
  };

  const dispatchGroup = (id: string) =>
    saveTimeGroups(timeGroups.map(g => g.id === id ? { ...g, isDispatched: true } : g));
  const completeGroup = (id: string) =>
    saveTimeGroups(timeGroups.filter(g => g.id !== id));
  const completeAppInGroup = (groupId: string, appId: string) => {
    const updated = timeGroups
      .map(g => g.id !== groupId ? g : { ...g, applications: g.applications.filter(a => a.id !== appId) })
      .filter(g => g.applications.length > 0);
    saveTimeGroups(updated);
  };

  // 서버 프리렌더 시각대와 브라우저 시각대 차이로 생기는 hydration 불일치를 피한다.
  const authUser = mounted ? getStoredAuthUser() : null;
  // 서버가 조직 내 작업자만 반환하므로 관리자 이름이 고정 시간표에 있어도 섞이지 않는다.
  const visibleWorkerNames = workerStatuses.map((status) => status.worker_name);
  const statusByWorker = new Map(workerStatuses.map((status) => [status.worker_name, status]));
  const serverUpcomingSlots = useMemo(() => groupAdminSchedules(todaySchedules), [todaySchedules]);

  const openAdminDispatch = async (slot: AdminTodaySlot) => {
    if (slot.assignedWorkers.length === 0) {
      setStaffingMessage("먼저 해당 출동의 작업자를 배정해 주세요.");
      document.getElementById("admin-worker-status")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setOpeningDispatch(slot.dispatchTime);
    setTodaySchedulesError(null);
    try {
      if (!slot.routeReady) {
        await dispatchConfirm(slot.assignedWorkers.length, slot.dispatchTime);
        await refreshTodaySchedules();
      }
      const byBuilding = new Map<string, Schedule[]>();
      for (const row of slot.rows) {
        const building = scheduleBuildingName(row);
        (byBuilding.get(building) ?? byBuilding.set(building, []).get(building)!).push(row);
      }
      const buildingStops = [...byBuilding.entries()].map(([building, rows]) => {
        const byApplication = new Map<string, Schedule[]>();
        for (const row of rows) {
          const key = row.신청번호 ?? building;
          (byApplication.get(key) ?? byApplication.set(key, []).get(key)!).push(row);
        }
        return {
          건물명: building,
          kind: "building" as const,
          scheduleId: rows[0]?.id,
          cards: [...byApplication.entries()].map(([applicationNumber, applicationRows]) => ({
            신청번호: applicationNumber,
            신청일자: "",
            신청부서: applicationRows[0]?.신청부서 ?? "-",
            itemSummary: applicationRows.length > 1
              ? `${applicationRows[0]?.품명 ?? "품목"} 외 ${applicationRows.length - 1}건`
              : applicationRows[0]?.품명 ?? "품목",
          })),
          items: rows.map((row) => ({
            자산번호: row.자산번호 ?? "",
            품명: row.품명 ?? "품목",
            수량: row.수량 ?? 1,
            설치장소: row.설치장소 ?? "",
          })),
        };
      });
      const plan = {
        출동일시: slot.dispatchTime,
        viewerRole: "admin",
        workerNames: slot.assignedWorkers,
        stops: [
          { 건물명: "창고 출발", kind: "warehouse", cards: [] },
          ...buildingStops,
          { 건물명: "창고 도착", kind: "warehouse", cards: [] },
        ],
      };
      sessionStorage.setItem("gwanzae-dispatch-plan", JSON.stringify(plan));
      sessionStorage.setItem(
        "gwanzae-dispatch-apps",
        JSON.stringify(Array.from(new Set(slot.rows.map((row) => row.신청번호).filter(Boolean)))),
      );
      sessionStorage.setItem("gwanzae-worker-names", JSON.stringify(slot.assignedWorkers));
      router.push("/dispatch");
    } catch (dispatchError) {
      setTodaySchedulesError(`출동 과정 준비에 실패했습니다: ${String(dispatchError)}`);
    } finally {
      setOpeningDispatch(null);
    }
  };

  const loadStaffingPreview = async () => {
    if (staffingLoading) return;
    setStaffingLoading(true);
    setStaffingMessage(null);
    try {
      const proposals = await staffingRecommendationsUpcoming();
      setStaffingProposals(proposals);
      setStaffingSelections(Object.fromEntries(
        proposals.map((proposal) => [
          proposal.dispatch_time,
          proposal.confirmed_workers.length > 0
            ? proposal.confirmed_workers
            : proposal.recommended_workers,
        ]),
      ));
    } catch (previewError) {
      setStaffingMessage(`추천안을 불러오지 못했습니다: ${String(previewError)}`);
    } finally {
      setStaffingLoading(false);
    }
  };

  useEffect(() => {
    void loadStaffingPreview();
  }, []);

  const toggleStaffingWorker = (proposal: StaffingProposal, workerName: string) => {
    setStaffingSelections((current) => {
      const selected = current[proposal.dispatch_time] ?? proposal.recommended_workers;
      return {
        ...current,
        [proposal.dispatch_time]: selected.includes(workerName)
          ? selected.filter((name) => name !== workerName)
          : [...selected, workerName],
      };
    });
  };

  const confirmStaffing = async (proposal: StaffingProposal) => {
    const selected = staffingSelections[proposal.dispatch_time] ?? proposal.recommended_workers;
    if (selected.length !== proposal.team_size || confirmingProposal) return;
    setConfirmingProposal(proposal.dispatch_time);
    setStaffingMessage(null);
    try {
      await confirmStaffingRecommendation(proposal, selected);
      setStaffingProposals((current) => current?.map((item) => (
        item.dispatch_time === proposal.dispatch_time ? { ...item, confirmed_workers: selected } : item
      )) ?? null);
      await refreshTodaySchedules();
      setStaffingMessage(
        proposal.confirmed_workers.length > 0
          ? "선택 인원을 다시 확정하고 출동 동선을 재최적화했습니다."
          : "인원 배정과 출동 동선을 확정했습니다. 배정된 작업자의 오늘 화면에 일정이 표시됩니다.",
      );
    } catch (confirmError) {
      setStaffingMessage(`확정하지 못했습니다: ${String(confirmError)}`);
    } finally {
      setConfirmingProposal(null);
    }
  };

  const refreshWorkerStatusPanel = async () => {
    if (workerStatusLoading) return;
    setWorkerStatusLoading(true);
    try {
      setWorkerStatuses(await workersStatusToday());
    } catch (statusError) {
      console.warn("[admin] 작업자 상태 새로고침 실패", statusError);
    } finally {
      setWorkerStatusLoading(false);
    }
  };

  return (
    <main className="app-screen font-pretendard flex-1 overflow-x-hidden px-4 pb-44 pt-safe-top">

      {/* 출동관리 — 제공된 모바일 시안의 헤더/일정 카드 구조 */}
      <header className="-mx-4 bg-[#ebf4ff] px-5 pb-3 pt-3">
        <div className="flex h-[30px] items-center justify-between">
          <h1 className="text-lg font-bold leading-none text-[#1f2937]">출동관리</h1>
          <button
            type="button"
            onClick={() => document.getElementById("admin-worker-status")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="flex h-[22px] items-center gap-1 rounded-md bg-[#f3f4f6] px-2 text-xs font-medium text-[#4b5563] transition-colors active:bg-[#e5e7eb]"
            aria-label={`작업자 상태 보기, ${staff.count}명 근무`}
          >
            {staff.count}명 근무
          </button>
        </div>
        <div className="mt-1.5 flex min-h-[18px] items-center gap-1.5 text-xs font-medium text-[#9ca3af]">
          <span>{mounted ? time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) : "--"}</span>
          <span>•</span>
          <span className="tabular-nums">{mounted ? time.toLocaleTimeString("ko-KR") : "--:--:--"} 기준</span>
          {authUser?.organization_entry_code && (
            <span className="ml-auto font-mono text-[15px] font-bold tracking-[0.04em] text-[#0043ff]">
              {authUser.organization_entry_code}
            </span>
          )}
        </div>
      </header>

      <section className="surface-card mt-4 p-4 shadow-[0_4px_12px_rgba(31,41,55,0.04)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-[#0043ff]" />
            <h2 className="text-base font-bold text-[#1f2937]">예정 수거 일정</h2>
          </div>
          <button
            type="button"
            onClick={() => { setTodaySchedulesLoading(true); void refreshTodaySchedules(); }}
            className="flex h-[26px] shrink-0 items-center gap-1 rounded-lg bg-[#f3f4f6] px-2.5 text-xs font-semibold text-[#4b5563]"
          >
            <RefreshCw className={`h-3 w-3 ${todaySchedulesLoading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
        <p className="mt-4 text-xs leading-[1.4] text-[#4b5563]">
          관리자는 전체 일정을 확인하고 인원 배정 후 작업자와 동일한 출동 과정·네비게이션을 열 수 있습니다.
        </p>

        {todaySchedulesError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{todaySchedulesError}</p>
        )}

        <div className="mt-4 space-y-3">
          {serverUpcomingSlots.map((slot) => {
            const dispatchDate = new Date(slot.dispatchTime);
            const buildings = Array.from(new Set(slot.rows.map(scheduleBuildingName)));
            const assigned = slot.assignedWorkers.length > 0;
            return (
              <article key={slot.dispatchTime} className="rounded-xl bg-[#f3f4f6] p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-bold text-[#1f2937]">
                    {Number.isNaN(dispatchDate.getTime())
                      ? slot.dispatchTime
                      : `${dispatchDate.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" })} ${dispatchDate.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`} 출동
                  </h3>
                  <span className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                    assigned ? "bg-[#e1fbf0] text-[#059669]" : "bg-[#fef3c7] text-[#b45309]"
                  }`}>
                    {assigned ? "배정 완료" : "배정 대기"}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs">
                  <span className="text-[#9ca3af]">신청 <b className="ml-1 text-[#1f2937]">{new Set(slot.rows.map((row) => row.신청번호)).size}건</b></span>
                  <span className="h-2.5 w-px bg-[#e5e7eb]" />
                  <span className="text-[#9ca3af]">필요 인원 <b className="ml-1 text-[#0043ff]">{slot.requiredPersonnel}명</b></span>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-[11px] font-semibold text-[#4b5563]">경로 순서</p>
                  <ol className="space-y-1.5">
                    {buildings.map((building, index) => (
                      <li key={`${building}-${index}`} className="flex min-h-4 items-center gap-2 text-[13px] font-medium text-[#1f2937]">
                        <span className={`mx-1 size-2 shrink-0 rounded-full ${index === buildings.length - 1 ? "bg-[#0043ff]" : "bg-[#9ca3af]"}`} />
                        <span>{building}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {assigned ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#d5f5e7] bg-[#f0fdf8] px-2.5 py-2 text-xs text-[#047857]">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{slot.assignedWorkers.join(", ")} 배정</span>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#fef3c7] bg-[#fffbeb] p-2.5 text-xs font-medium text-[#b45309]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    아직 작업자가 배정되지 않았습니다.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void openAdminDispatch(slot)}
                  disabled={openingDispatch === slot.dispatchTime}
                  className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0043ff] px-4 text-[13px] font-bold text-white shadow-[0_4px_8px_rgba(0,67,255,0.12)] disabled:opacity-50"
                >
                  {openingDispatch === slot.dispatchTime
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : assigned ? <Navigation className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  {assigned ? "출동 과정·네비게이션 보기" : "인원 배정하기"}
                </button>
              </article>
            );
          })}
          {!todaySchedulesLoading && serverUpcomingSlots.length === 0 && (
            <p className="rounded-lg bg-[#f3f4f6] p-4 text-center text-xs font-medium text-[#4b5563]">오늘 이후 등록된 수거 일정이 없습니다.</p>
          )}
          {todaySchedulesLoading && serverUpcomingSlots.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#9ca3af]">
              <Loader2 className="h-4 w-4 animate-spin" /> 일정을 불러오는 중입니다.
            </div>
          )}
        </div>
      </section>

      {/* ── 헤더 ── */}
      <header className="hidden">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-[#1f2937]">{authUser?.organization_name ?? "관재 조직"}</h1>
            <p className="mt-1 text-xs font-medium text-[#9ca3af]">
              {mounted ? time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) : "--"}
              <span className="mx-1.5">•</span>
              {mounted ? time.toLocaleTimeString("ko-KR") : "--:--:--"} 기준
            </p>
            {authUser?.organization_entry_code && (
              <p className="mt-1 font-mono text-[15px] font-extrabold tracking-[0.08em] text-[#0043ff]">{authUser.organization_entry_code}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "mt-1 flex items-center gap-1.5 rounded-lg bg-[#f3f4f6] px-2.5 py-1.5 text-xs font-semibold text-[#4b5563]"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              {staff.count}명 근무
            </motion.div>
            <button
              type="button"
              aria-label="로그아웃"
              onClick={() => { clearAuth(); router.replace("/login"); }}
              className="mt-1 flex size-9 items-center justify-center rounded-xl bg-white text-slate-500"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {staff.count > 0 && (
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{staff.label}</p>
        )}

        {/* 실시간 시계 */}
        <div className="hidden">
          <Clock className="w-3.5 h-3.5 text-indigo-300" />
          <span className="tabular-nums font-medium">{mounted ? time.toLocaleTimeString("ko-KR") : "--:--:--"}</span>
        </div>
      </header>

      {/* 서버 기준 금일 전체 출동 일정 */}
      <section className="hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#0043ff]" />
              <h2 className="text-sm font-bold text-slate-900">금일 수거 일정</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              관리자는 전체 일정을 확인하고 인원 배정 후 작업자와 동일한 출동 과정·네비게이션을 열 수 있습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setTodaySchedulesLoading(true); void refreshTodaySchedules(); }}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-[11px] font-bold text-slate-600"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${todaySchedulesLoading ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>

        {todaySchedulesError && (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{todaySchedulesError}</p>
        )}
        <div className="mt-4 space-y-3">
          {serverUpcomingSlots.map((slot) => {
            const time = new Date(slot.dispatchTime);
            const buildings = Array.from(new Set(slot.rows.map(scheduleBuildingName)));
            const assigned = slot.assignedWorkers.length > 0;
            return (
              <div key={slot.dispatchTime} className="rounded-xl bg-[#f3f4f6] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-extrabold text-slate-800">
                      {Number.isNaN(time.getTime())
                        ? slot.dispatchTime
                        : time.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 출동
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {buildings.join(" → ")} · 신청 {new Set(slot.rows.map((row) => row.신청번호)).size}건 · 필요 {slot.requiredPersonnel}명
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    assigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {assigned ? "배정 완료" : "배정 대기"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {slot.assignedWorkers.map((name) => (
                    <span key={name} className="rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-indigo-700">{name}</span>
                  ))}
                  {!assigned && <span className="text-[11px] text-slate-400">아직 작업자가 배정되지 않았습니다.</span>}
                </div>
                <button
                  type="button"
                  onClick={() => void openAdminDispatch(slot)}
                  disabled={openingDispatch === slot.dispatchTime}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${
                    assigned ? "bg-[#0043ff] text-white" : "bg-[#d0ddef] text-[#6b7fa0]"
                  } disabled:opacity-50`}
                >
                  {openingDispatch === slot.dispatchTime
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : assigned ? <Navigation className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                  {assigned ? "출동 과정·네비게이션 보기" : "인원 배정하기"}
                </button>
              </div>
            );
          })}
          {!todaySchedulesLoading && serverUpcomingSlots.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">오늘 등록된 수거 일정이 없습니다.</p>
          )}
          {todaySchedulesLoading && serverUpcomingSlots.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> 일정을 불러오는 중입니다.
            </div>
          )}
        </div>
      </section>


      {/* ── Section 1: 미최적화 신청서 ── */}
      {unoptimizedApps.length > 0 && (
        <section className="mb-7">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">대기 신청서</span>
              <span className="text-[11px] font-bold bg-amber-400 text-white px-2 py-0.5 rounded-full">
                {unoptimizedApps.length}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {unoptimizedApps.map((app, i) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl overflow-hidden"
              >
                {/* 상단 컬러 바 */}
                <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />

                <div className="p-4">
                  {/* 신청번호 + 상태 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{app.신청번호}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{app.신청부서}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-xl">
                      최적화 대기
                    </span>
                  </div>

                  {/* 물품 목록 */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2 mb-3">
                    {app.물품목록.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-700">{item.품명}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                        <span className="text-slate-500 truncate">{item.설치장소}</span>
                      </div>
                    ))}
                  </div>

                  {/* 하단 정보 */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-indigo-50 px-3 py-1.5 rounded-xl">
                      <Users className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-xs font-bold text-indigo-600">필요 {app.requiredPersonnel}명</span>
                    </div>
                    <span className="text-xs text-slate-400">{app.물품목록.length}개 물품</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section 2: 출동 시간 그룹 ── */}
      {timeGroups.length > 0 && (
        <section className="hidden">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">출동 일정</span>
            <span className="text-[11px] font-bold bg-indigo-500 text-white px-2 py-0.5 rounded-full">
              {timeGroups.length}
            </span>
          </div>

          <div className="space-y-4">
            {timeGroups.map((group, i) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white rounded-2xl overflow-hidden"
              >
                {/* 그룹 헤더 */}
                <div className={cn(
                  "px-4 py-4",
                  group.isDispatched
                    ? "bg-gradient-to-r from-indigo-500 to-violet-500"
                    : "bg-gradient-to-r from-indigo-600 to-indigo-500"
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-indigo-200 text-[11px] font-semibold mb-0.5">
                        {group.isDispatched ? "출동 중" : "예정"}
                      </div>
                      <div className="font-bold text-white text-base leading-snug">
                        {group.scheduledDateTime}
                      </div>
                      <div className="text-indigo-200 text-xs mt-1">
                        신청서 {group.applications.length}건 ·{" "}
                        최대 {Math.max(...group.applications.map(a => a.requiredPersonnel))}명 필요
                      </div>
                      {group.isDispatched && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-100 bg-white/10 rounded-lg px-2 py-1">
                          <Navigation className="w-3 h-3 shrink-0" />
                          <span>{group.optimizedRoute.join(" → ")}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {!group.isDispatched ? (
                        <button
                          onClick={() => handleDispatchClick(group)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white text-indigo-600 active:bg-indigo-50 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          출동
                        </button>
                      ) : (
                        <button
                          onClick={() => saveTimeGroups(timeGroups.map(g => g.id === group.id ? { ...g, isDispatched: false } : g))}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/20 text-white active:bg-white/30 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          취소
                        </button>
                      )}
                      <button
                        onClick={() => completeGroup(group.id)}
                        className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white active:bg-emerald-600 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        완료
                      </button>
                    </div>
                  </div>
                </div>

                {/* 그룹 내 신청서 */}
                <div className="divide-y divide-slate-100">
                  {group.applications.map(app => (
                    <div key={app.id} className="p-4">
                      <div className="flex items-start justify-between mb-2.5">
                        <div className="min-w-0">
                          <div className="font-bold text-sm text-slate-800">{app.신청번호}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{app.신청부서}</div>
                        </div>
                        <button
                          onClick={() => completeAppInGroup(group.id, app.id)}
                          className="shrink-0 ml-3 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 active:bg-emerald-50 active:text-emerald-600 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          완료
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {app.물품목록.map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                            <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span className="font-semibold text-slate-700">{item.품명}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500 truncate">{item.설치장소}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex items-center gap-1 text-xs text-indigo-600 font-semibold bg-indigo-50 px-2 py-1 rounded-lg">
                          <Users className="w-3 h-3" />{app.requiredPersonnel}명
                        </div>
                        <span className="text-xs text-slate-400">{app.물품목록.length}개 물품</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── 빈 상태 ── */}
      {unoptimizedApps.length === 0 && timeGroups.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="hidden"
        >
          <div className="w-20 h-20 rounded-3xl bg-white flex items-center justify-center mb-5 shadow-sm">
            <Package className="w-10 h-10 text-indigo-300" />
          </div>
          <p className="text-base font-bold text-slate-700 mb-1">등록된 신청서가 없어요</p>
          <p className="text-sm text-slate-400 leading-relaxed max-w-[220px]">
            아래 <span className="text-indigo-500 font-semibold">신청서 촬영</span> 버튼을 눌러<br />신청서를 스캔하세요
          </p>
        </motion.div>
      )}

      {/* ── 하단 고정 버튼 ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="fixed bottom-16 left-0 right-0 z-40 mx-auto w-full max-w-[430px] bg-gradient-to-t from-[#ebf4ff] via-[#ebf4ff]/95 to-transparent px-4 pb-3 pt-5">
        <div className="flex gap-3">
          <button
            onClick={() => { resetScan(); setScanOpen(true); }}
            className="flex-1 flex items-center justify-center gap-2 bg-white rounded-2xl py-4 font-bold text-slate-700 text-sm active:bg-slate-50 transition-all"
          >
            <Camera className="w-4 h-4 text-indigo-500" />
            신청서 촬영
          </button>
          <button
            onClick={handleOptimize}
            disabled={unoptimizedApps.length === 0 || isOptimizing}
            className={cn(
              "flex-[1.3] flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm transition-all",
              unoptimizedApps.length > 0 && !isOptimizing
                ? "bg-indigo-600 text-white active:bg-indigo-700"
                : "bg-slate-200 text-slate-400"
            )}
          >
            {isOptimizing
              ? <><Loader2 className="w-4 h-4 animate-spin" />최적화 중...</>
              : <><Timer className="w-4 h-4" />출동 시간 최적화</>
            }
          </button>
        </div>
      </div>

      {/* 작업자 상태 — 관리자 페이지 안에서 바로 확인 */}
      <section id="admin-worker-status" className="-mx-4 mt-4 mb-7 scroll-mt-4 bg-[#ebf4ff] px-4 pb-10 pt-4">
        <div className="mb-3 flex h-10 items-center justify-between px-1">
          <h2 className="text-[20px] font-bold leading-6 text-[#1f2937]">작업자 상태</h2>
          <button
            type="button"
            onClick={() => void refreshWorkerStatusPanel()}
            disabled={workerStatusLoading}
            className="flex size-8 items-center justify-center rounded-full text-[#1f2937] active:bg-white/60 disabled:opacity-50"
            aria-label="작업자 상태 새로고침"
          >
            <RefreshCw className={`size-5 ${workerStatusLoading ? "animate-spin" : ""}`} strokeWidth={2.2} />
          </button>
        </div>

        <div>
              <div className="space-y-3">
                {visibleWorkerNames.map((name) => {
                  const status = statusByWorker.get(name);
                  const condition = workerCondition(status?.state_borg_cr10);
                  return (
                    <article key={name} className="min-h-[157px] overflow-hidden rounded-2xl bg-white shadow-[0_4px_8px_rgba(31,41,55,0.03)]">
                      <div className={`flex h-[46px] items-center gap-2.5 px-4 ${condition.bannerClass}`}>
                        <span className="flex size-[30px] shrink-0 items-center justify-center overflow-hidden" aria-hidden="true">
                          {condition.iconSrc ? (
                            <Image src={condition.iconSrc} alt="" width={27} height={27} className="size-[27px]" />
                          ) : (
                            <span className="flex size-[27px] items-center justify-center rounded-full bg-slate-300 text-sm font-bold text-white">—</span>
                          )}
                        </span>
                        <span className={`text-[18px] font-bold leading-[21px] ${condition.textClass}`}>{condition.label}</span>
                      </div>
                      <div className="flex flex-col gap-4 p-4">
                        <h3 className="text-[18px] font-bold leading-[21px] text-[#1f2937]">{name}</h3>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                            <p className="whitespace-nowrap text-[14px] font-semibold leading-[17px] text-[#9ca3af]">작업 시간</p>
                            <p className="flex items-baseline gap-0.5 text-[18px] font-bold leading-[21px] text-[#1f2937]">
                              {status ? Math.round(status.total_work_seconds / 60) : 0}<span className="text-[12px] font-normal text-[#4b5563]">분</span>
                            </p>
                          </div>
                          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                            <p className="whitespace-nowrap text-[14px] font-semibold leading-[17px] text-[#9ca3af]">몸 피로</p>
                            <p className="text-[16px] font-bold leading-[19px] text-[#1f2937]">{status?.latest_actual_borg_cr10 ?? "-"}</p>
                          </div>
                          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                            <p className="whitespace-nowrap text-[14px] font-semibold leading-[17px] text-[#9ca3af]">상태 참고값</p>
                            <p className="text-[16px] font-bold leading-[19px] text-[#1f2937]">{status?.state_borg_cr10 ?? "-"}</p>
                          </div>
                          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                            <p className="whitespace-nowrap text-[14px] font-semibold leading-[17px] text-[#9ca3af]">누적 피로</p>
                            <p className="text-[16px] font-bold leading-[19px] text-[#1f2937]">{status?.daily_load ?? 0}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 border-t border-[#f1f5f9] pt-3 text-[13px]">
                          <p className="shrink-0 font-semibold text-[#9ca3af]">최근 불편 부위</p>
                          <p className="min-w-0 text-right font-bold text-[#1f2937]">
                            {status?.latest_body_discomfort_parts == null
                              ? "미확인"
                              : status.latest_body_discomfort_parts.length > 0
                                ? status.latest_body_discomfort_parts.join(", ")
                                : "없음"}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {workerStatusLoading && visibleWorkerNames.length === 0 && (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-10 text-xs text-[#9ca3af]">
                    <Loader2 className="size-4 animate-spin" /> 작업자 상태를 불러오는 중입니다.
                  </div>
                )}
                {!workerStatusLoading && visibleWorkerNames.length === 0 && (
                  <div className="rounded-2xl bg-white px-4 py-10 text-center text-xs text-[#4b5563]">
                    조직에 등록된 작업자와 인원표가 없습니다.
                  </div>
                )}
              </div>

              <div className="px-1 py-3 text-[11px] leading-[1.4] text-[#9ca3af]">
                <p>* 테스트 초기값은 화면과 배정 흐름을 확인하기 위한 참고값이며 실제 응답으로 계산하지 않습니다.</p>
                <p className="mt-1.5">* 누적부하는 당일 실제 작업만 반영합니다.</p>
              </div>

              <section id="admin-staffing" className="rounded-2xl bg-white p-5 shadow-[0_4px_16px_rgba(31,41,55,0.03)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-[18px] text-[#0043ff]" />
                    <h3 className="text-[16px] font-bold leading-[19px] text-[#1f2937]">다음 출동 인원 참고안</h3>
                  </div>
                  <button
                    type="button"
                    onClick={loadStaffingPreview}
                    disabled={staffingLoading}
                    className="flex h-[30px] shrink-0 items-center gap-1 rounded-lg bg-[#0043ff] px-3 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    {staffingLoading && <Loader2 className="size-3.5 animate-spin" />}
                    추천안 보기
                  </button>
                </div>
                <p className="mt-4 text-[12px] leading-[1.4] text-[#4b5563]">
                  미리보기는 일정을 바꾸지 않습니다. 관리자가 인원을 검토하고 확정해야 기록됩니다.
                </p>

                {staffingProposals && (
                  <div className="mt-4 space-y-3">
                    {staffingProposals.map((proposal) => {
                      const selected = staffingSelections[proposal.dispatch_time] ?? proposal.recommended_workers;
                      const selectionValid = selected.length === proposal.team_size;
                      return (
                        <div key={proposal.dispatch_time} className="rounded-xl bg-[#f3f4f6] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold text-[#1f2937]">
                                {new Date(proposal.dispatch_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 출동
                              </p>
                              <p className="mt-1 text-[10px] text-[#4b5563]">
                                필요 {proposal.required_team_size}명 · 선택 {selected.length}/{proposal.team_size}명 · 신청 {proposal.application_numbers.length}건
                              </p>
                            </div>
                            {proposal.confirmed_workers.length > 0 && (
                              <span className="shrink-0 rounded-md bg-[#e1fbf0] px-2 py-1 text-[10px] font-bold text-[#059669]">확정</span>
                            )}
                          </div>
                          {proposal.required_team_size > proposal.team_size && (
                            <p className="mt-2 text-[10px] font-bold text-[#b45309]">가용 인원이 {proposal.required_team_size - proposal.team_size}명 부족합니다.</p>
                          )}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {proposal.worker_details.map((worker) => {
                              const checked = selected.includes(worker.worker_name);
                              return (
                                <button
                                  key={worker.worker_name}
                                  type="button"
                                  disabled={!worker.available}
                                  onClick={() => toggleStaffingWorker(proposal, worker.worker_name)}
                                  className={`rounded-lg border px-3 py-2 text-left ${checked ? "border-[#0043ff] bg-[#ebf4ff]" : "border-[#e5e7eb] bg-white"} disabled:cursor-not-allowed disabled:opacity-50`}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <p className={`text-xs font-bold ${checked ? "text-[#0043ff]" : "text-[#1f2937]"}`}>{worker.worker_name}</p>
                                    {!worker.available && <span className="text-[9px] font-bold text-[#9ca3af]">배정 불가</span>}
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-[#9ca3af]">{worker.reason}</p>
                                </button>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            disabled={!selectionValid || confirmingProposal === proposal.dispatch_time}
                            onClick={() => confirmStaffing(proposal)}
                            className="mt-3 h-9 w-full rounded-lg bg-[#1f2937] px-3 text-[11px] font-bold text-white disabled:opacity-40"
                          >
                            {confirmingProposal === proposal.dispatch_time
                              ? (proposal.confirmed_workers.length > 0 ? "재최적화 중…" : "확정 중…")
                              : (proposal.confirmed_workers.length > 0 ? "선택 인원 재확정·재최적화" : "선택 인원 확정")}
                          </button>
                        </div>
                      );
                    })}
                    {staffingProposals.length === 0 && (
                      <p className="rounded-lg bg-[#f3f4f6] p-3 text-center text-xs font-medium text-[#4b5563]">오늘 남은 출동 일정이 없습니다.</p>
                    )}
                  </div>
                )}
                {staffingMessage && <p className="mt-3 text-[11px] leading-relaxed text-[#4b5563]">{staffingMessage}</p>}
              </section>

              <details className="mt-3 rounded-2xl bg-white p-4 text-[#1f2937]">
                <summary className="cursor-pointer text-xs font-bold">피로도 모델 데이터 관리</summary>
                <p className="mt-2 text-[10px] leading-relaxed text-[#9ca3af]">CSV·JSON·XLSX 파일로 공통 모델과 작업자별 모델을 갱신합니다.</p>
                <input
                  ref={fatigueDatasetInputRef}
                  type="file"
                  accept=".csv,.json,.xlsx"
                  className="hidden"
                  onChange={handleFatigueDatasetChange}
                />
                <button
                  type="button"
                  onClick={() => fatigueDatasetInputRef.current?.click()}
                  disabled={fatigueDatasetTraining}
                  className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#f3f4f6] px-3 text-[11px] font-bold text-[#0043ff] disabled:opacity-50"
                >
                  {fatigueDatasetTraining ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                  {fatigueDatasetTraining ? "학습 중" : "데이터셋 선택"}
                </button>
                {fatigueDatasetResult && (
                  <p className="mt-2 rounded-lg bg-[#e1fbf0] px-3 py-2 text-[10px] text-[#047857]">
                    {fatigueDatasetResult.row_count}행 학습 완료 · 개인 모델 {fatigueDatasetResult.personal_model_count}명
                  </p>
                )}
                {fatigueDatasetError && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-600">학습 실패: {fatigueDatasetError}</p>
                )}
              </details>
        </div>
      </section>

      {/* ── 신청서 촬영 바텀 시트 ── */}
      <AnimatePresence>
        {scanOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setScanOpen(false); resetScan(); }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl flex flex-col max-h-[90dvh] shadow-2xl"
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>

              <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={cn("p-1.5 rounded-xl", scanStep === "review" ? "bg-emerald-500" : "bg-indigo-600")}>
                    {scanStep === "review"
                      ? <CheckCircle2 className="w-4 h-4 text-white" />
                      : <ScanLine className="w-4 h-4 text-white" />
                    }
                  </div>
                  <span className="font-bold text-slate-800">
                    {scanStep === "review" ? "신청서 등록 완료" : "신청서 촬영 및 등록"}
                  </span>
                </div>
                <button onClick={() => { setScanOpen(false); resetScan(); }} className="p-2 rounded-full active:bg-slate-100 transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* Step 1: 파일 선택 */}
                {scanStep === "camera" && (
                  <div className="p-5 space-y-4">
                    {scanError && (
                      <div className="bg-red-50 text-red-600 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {scanError}
                      </div>
                    )}

                    {/* 선택된 파일 목록 */}
                    {selectedFiles.length > 0 ? (
                      <div className="space-y-2">
                        {selectedFiles.map((file, i) => (
                          <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                            <span className="flex-1 text-sm text-slate-700 truncate">{file.name}</span>
                            <button
                              onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                              className="p-1 rounded-full hover:bg-slate-200 transition-colors"
                            >
                              <X className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="카메라로 신청서 촬영"
                        className="aspect-[4/3] w-full bg-slate-100 rounded-2xl relative flex flex-col items-center justify-center gap-3 overflow-hidden active:bg-slate-200 transition-colors"
                      >
                        <motion.div
                          animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 2 }}
                          className="w-16 h-16 border-2 border-indigo-400 rounded-2xl flex items-center justify-center"
                        >
                          <FileText className="w-8 h-8 text-indigo-400" />
                        </motion.div>
                        <p className="text-slate-400 text-sm">물품 불용/반납신청서</p>
                        <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                        <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                        <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                        <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
                      </button>
                    )}

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-white border-2 border-dashed border-indigo-300 py-3.5 rounded-2xl font-bold text-indigo-500 text-sm flex items-center justify-center gap-2 active:bg-indigo-50 transition-all"
                    >
                      <Camera className="w-4 h-4" />
                      {selectedFiles.length > 0 ? "사진 추가" : "사진 촬영 / 파일 선택"}
                    </button>

                    {selectedFiles.length > 0 && (
                      <button
                        onClick={handleStartScan}
                        className="w-full bg-indigo-600 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 active:bg-indigo-700 transition-all"
                      >
                        <ScanLine className="w-5 h-5" />
                        {selectedFiles.length}장 인식 시작
                      </button>
                    )}
                  </div>
                )}

                {/* Step 2: 인식 중 */}
                {scanStep === "scanning" && (
                  <div className="py-20 flex flex-col items-center gap-5 text-center px-6">
                    <div className="w-20 h-20 rounded-3xl bg-indigo-50 flex items-center justify-center">
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}>
                        <Loader2 className="w-10 h-10 text-indigo-500" />
                      </motion.div>
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-800 mb-1">신청서 인식 중...</h4>
                      <p className="text-slate-400 text-sm">서버 AI OCR이 신청서를 분석하고 있습니다.</p>
                    </div>
                  </div>
                )}

                {/* Step 3: 결과 확인 */}
                {scanStep === "review" && scannedData && (() => {
                  const allFilled = scannedData.물품목록.every((_, i) => {
                    const v = parseInt(itemPersonnelInput[i] ?? "", 10);
                    const q = parseInt(itemQuantityInput[i] ?? "", 10);
                    const name = (itemNameInput[i] ?? "").trim();
                    return v >= 1 && q >= 1 && name.length > 0;
                  });
                  return (
                    <div className="p-5 space-y-4 pb-safe-bottom">

                      {scanError && (
                        <div className="bg-red-50 text-red-600 text-sm rounded-2xl px-4 py-3 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          {scanError}
                        </div>
                      )}

                      {/* 신청 정보 + 물품 목록 통합 카드 */}
                      <div className="bg-slate-50 rounded-2xl overflow-hidden">

                        {/* 기본 정보 */}
                        <div className="p-4 space-y-3">
                          {([
                            { label: "신청번호", key: "신청번호" },
                            { label: "신청부서", key: "신청부서" },
                            { label: "신청일",   key: "신청일자" },
                          ] as const).map(({ label, key }) => (
                            <div key={key} className="flex items-center gap-3">
                              <span className="text-xs text-slate-400 w-14 shrink-0">{label}</span>
                              <input
                                type="text"
                                value={metaInput[key]}
                                onChange={e => setMetaInput(prev => ({ ...prev, [key]: e.target.value }))}
                                className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              />
                            </div>
                          ))}
                        </div>

                        {/* 구분선 */}
                        <div className="mx-4 border-t border-slate-200" />

                        {/* 물품 목록 */}
                        <div className="p-4 space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-500">물품 목록</span>
                            <span className="text-xs text-slate-400">{scannedData.물품목록.length}개</span>
                          </div>
                          {scannedData.물품목록.map((item, i) => (
                            <div key={i} className="bg-white rounded-xl p-3 border border-slate-200 space-y-2">
                              {/* 행 1: 품명 + 수량 */}
                              <div className="flex items-center gap-2">
                                <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                                <input
                                  type="text"
                                  value={itemNameInput[i] ?? item.품명}
                                  onChange={e => setItemNameInput(prev => ({ ...prev, [i]: e.target.value }))}
                                  className="flex-1 min-w-0 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <span className="text-xs text-slate-400 shrink-0">×</span>
                                <input
                                  type="number" min="1" max="999"
                                  value={itemQuantityInput[i] ?? ""}
                                  onChange={e => setItemQuantityInput(prev => ({ ...prev, [i]: e.target.value }))}
                                  placeholder="1"
                                  className="w-12 text-center text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              {/* 행 2: 설치장소 + 필요인원수 */}
                              <div className="flex items-center gap-2 pl-5">
                                <p className="text-[11px] text-slate-400 truncate flex-1">{item.설치장소}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="number" min="1" max="99"
                                    value={itemPersonnelInput[i] ?? ""}
                                    onChange={e => setItemPersonnelInput(prev => ({ ...prev, [i]: e.target.value }))}
                                    placeholder="0"
                                    className="w-12 text-center bg-indigo-50 border border-indigo-200 rounded-lg px-1 py-1.5 text-xs font-black text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  />
                                  <span className="text-xs text-slate-400">명</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {!allFilled && (
                            <p className="text-[11px] text-amber-500 pt-1">
                              ⚠ 품명과 필요 인원 수를 모두 입력해 주세요.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 버튼 */}
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => { setScanOpen(false); resetScan(); }}
                          className="flex-1 bg-slate-100 active:bg-slate-200 py-4 rounded-2xl font-bold text-slate-500 text-sm transition-all"
                        >
                          취소
                        </button>
                        <button
                          onClick={() => void handleSaveApplication()}
                          disabled={!allFilled || scanSaving}
                          className={cn(
                            "flex-[2] py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                            allFilled && !scanSaving ? "bg-indigo-600 text-white active:bg-indigo-700" : "bg-slate-200 text-slate-400"
                          )}
                        >
                          {scanSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                          {scanSaving ? "저장 중..." : "저장하기"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── 출동 확인 팝업 ── */}
      <AnimatePresence>
        {dispatchPopup && (
          <>
            {/* 배경 */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !routeLoading && setDispatchPopup(null)}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            />

            {/* 바텀시트 */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl flex flex-col max-h-[88dvh] shadow-2xl"
            >
              {/* 핸들 */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>

              {/* 헤더 */}
              <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-indigo-600">
                    <Truck className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">출동 동선 확인</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{dispatchPopup.scheduledDateTime}</p>
                  </div>
                </div>
                {!routeLoading && (
                  <button onClick={() => setDispatchPopup(null)} className="p-2 rounded-full active:bg-slate-100 transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                )}
              </div>

              {/* 본문 */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">

                {/* 투입 인원 정보 */}
                <div className="flex items-center gap-3 bg-indigo-50 rounded-2xl px-4 py-3">
                  <Users className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="text-xs text-indigo-400 font-semibold">현재 투입 가능 인원</p>
                    <p className="text-sm font-black text-indigo-700 mt-0.5">
                      {staff.count > 0 ? `${staff.count}명 (${staff.label})` : "근무 시간 외"}
                    </p>
                  </div>
                </div>

                {/* 최적 동선 섹션 */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5" />
                    최적 동선
                  </p>

                  {routeLoading && (
                    <div className="flex items-center gap-2 py-4 justify-center">
                      <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                      <span className="text-sm text-slate-400 font-medium">동선 계산 중...</span>
                    </div>
                  )}

                  {routeError && (
                    <div className="flex items-start gap-2 text-red-500 bg-red-50 rounded-xl px-3 py-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold">API 오류</p>
                        <p className="text-[11px] mt-0.5 break-all">{routeError}</p>
                        <button
                          onClick={() => handleDispatchClick(dispatchPopup)}
                          className="mt-2 flex items-center gap-1 text-[11px] font-bold text-red-500 underline"
                        >
                          <RefreshCw className="w-3 h-3" />재시도
                        </button>
                      </div>
                    </div>
                  )}

                  {!routeLoading && !routeError && routeData !== null && (() => {
                    const route = extractRoute(routeData);
                    return route ? (
                      /* 경로 배열을 화살표로 시각화 */
                      <div className="flex flex-wrap items-center gap-1.5">
                        {route.map((stop, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span className="bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                              {stop}
                            </span>
                            {i < route.length - 1 && (
                              <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* 파싱 불가 시 raw 데이터 표시 */
                      <pre className="text-[11px] text-slate-600 bg-white rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                        {JSON.stringify(routeData, null, 2)}
                      </pre>
                    );
                  })()}

                  {/* API 응답 전 — 기존 클라이언트 동선 미리보기 */}
                  {!routeLoading && routeData === null && !routeError && (
                    <div className="flex flex-wrap items-center gap-1.5 opacity-40">
                      {dispatchPopup.optimizedRoute.map((stop, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="bg-slate-400 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                            {stop}
                          </span>
                          {i < dispatchPopup.optimizedRoute.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 물품 목록 요약 */}
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    물품 목록 ({dispatchPopup.applications.reduce((s, a) => s + a.물품목록.length, 0)}개)
                  </p>
                  <div className="space-y-2">
                    {dispatchPopup.applications.map(app => (
                      <div key={app.id} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-600 mb-2">
                          {app.신청번호} · {app.신청부서}
                        </p>
                        <div className="space-y-1">
                          {app.물품목록.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                              <span className="font-semibold text-slate-700">{item.품명}</span>
                              <span className="text-slate-400">×{item.수량}</span>
                              <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                              <span className="text-slate-500 truncate">{item.설치장소}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 하단 버튼 */}
              <div className="px-5 pt-3 pb-safe-bottom border-t border-slate-100 flex gap-3 shrink-0">
                <button
                  onClick={() => setDispatchPopup(null)}
                  disabled={routeLoading}
                  className="flex-1 bg-slate-100 active:bg-slate-200 py-4 rounded-2xl font-bold text-slate-500 text-sm transition-all disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  onClick={() => confirmDispatch(dispatchPopup.id)}
                  disabled={routeLoading}
                  className="flex-[2] flex items-center justify-center gap-2 bg-indigo-600 active:bg-indigo-700 py-4 rounded-2xl font-bold text-white text-sm transition-all disabled:opacity-40"
                >
                  {routeLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" />계산 중...</>
                    : <><Truck className="w-4 h-4" />출동 시작</>
                  }
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <TabBar />
    </main>
  );
}
