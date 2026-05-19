"use client";

import { useState } from "react";

const API_BASE = "https://bodies-copied-lit-namely.trycloudflare.com";

type Result = { ok: boolean; status?: number; data?: unknown; error?: string };

const DEFAULT_APPLICATIONS = JSON.stringify([
  {
    "신청번호": "20250043",
    "신청일자": "2025-09-17",
    "신청부서": "외국어대학관",
    "물품목록": [
      { "품명": "키보드", "설치장소": "외국어대학관 124", "수량": 2, "필요인원수": 1 },
      { "품명": "냉장고", "설치장소": "외국어대학관 234", "수량": 2, "필요인원수": 4 }
    ]
  },
  {
    "신청번호": "20250044",
    "신청일자": "2025-09-17",
    "신청부서": "공학실험동",
    "물품목록": [
      { "품명": "책장 목재", "설치장소": "공학실험동 220", "수량": 1, "필요인원수": 2 },
      { "품명": "제빙기", "설치장소": "공학실험동 120", "수량": 1, "필요인원수": 2 }
    ]
  }
], null, 2);

const DEFAULT_STAFF = JSON.stringify(
  ["최현", "정하람", "강경래", "박우민"],
  null, 2
);

export default function TestPage() {
  const [healthResult, setHealthResult] = useState<Result | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const [optimizeResult, setOptimizeResult] = useState<Result | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [applications, setApplications] = useState(DEFAULT_APPLICATIONS);
  const [staff, setStaff] = useState(DEFAULT_STAFF);
  const [appError, setAppError] = useState<string | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);

  async function checkHealth() {
    setHealthLoading(true);
    setHealthResult(null);
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      setHealthResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setHealthResult({ ok: false, error: String(e) });
    } finally {
      setHealthLoading(false);
    }
  }

  async function runOptimize() {
    setAppError(null);
    setStaffError(null);

    let parsedApps: unknown;
    let parsedStaff: unknown;

    try {
      parsedApps = JSON.parse(applications);
    } catch {
      setAppError("유효한 JSON 배열을 입력하세요.");
      return;
    }
    if (!Array.isArray(parsedApps)) {
      setAppError("배열([]) 형식이어야 합니다.");
      return;
    }

    try {
      parsedStaff = JSON.parse(staff);
    } catch {
      setStaffError("유효한 JSON 배열을 입력하세요.");
      return;
    }
    if (!Array.isArray(parsedStaff)) {
      setStaffError("배열([]) 형식이어야 합니다.");
      return;
    }

    setOptimizeLoading(true);
    setOptimizeResult(null);
    try {
      const body = { applications: parsedApps, available_staff: parsedStaff };
      const res = await fetch(`${API_BASE}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setOptimizeResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setOptimizeResult({ ok: false, error: String(e) });
    } finally {
      setOptimizeLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 font-mono text-sm">
      <h1 className="text-xl font-bold mb-1 text-gray-800">API Test</h1>
      <p className="text-gray-400 mb-8 text-xs">{API_BASE}</p>

      {/* Health */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded mr-2">GET</span>
            <span className="font-semibold text-gray-700">/health</span>
          </div>
          <button
            onClick={checkHealth}
            disabled={healthLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {healthLoading ? "요청 중..." : "Send"}
          </button>
        </div>
        {healthResult && <ResultBox result={healthResult} />}
      </section>

      {/* Optimize */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">POST</span>
            <span className="font-semibold text-gray-700">/optimize</span>
            <span className="ml-2 text-xs text-gray-400">application/json</span>
          </div>
          <button
            onClick={runOptimize}
            disabled={optimizeLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {optimizeLoading ? "처리 중..." : "Send"}
          </button>
        </div>

        {/* 신청서 목록 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            신청서 목록
            <span className="ml-1.5 font-normal text-gray-400">— applications: object[]</span>
          </label>
          <textarea
            value={applications}
            onChange={e => { setApplications(e.target.value); setAppError(null); }}
            rows={14}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${appError ? "border-red-400" : "border-gray-200"}`}
          />
          {appError && <p className="text-red-500 text-xs mt-1">{appError}</p>}
        </div>

        {/* 가용 인원 */}
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            현재 가용 인원
            <span className="ml-1.5 font-normal text-gray-400">— available_staff: string[]</span>
          </label>
          <textarea
            value={staff}
            onChange={e => { setStaff(e.target.value); setStaffError(null); }}
            rows={4}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${staffError ? "border-red-400" : "border-gray-200"}`}
          />
          {staffError && <p className="text-red-500 text-xs mt-1">{staffError}</p>}
        </div>

        {optimizeResult && <ResultBox result={optimizeResult} />}
      </section>
    </main>
  );
}

function ResultBox({ result }: { result: Result }) {
  const raw = result.error ?? JSON.stringify(result.data, null, 2);
  return (
    <div className={`rounded-lg border p-3 ${result.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
      <span className={`text-xs font-bold ${result.ok ? "text-green-600" : "text-red-500"}`}>
        {result.status ? `${result.status} ` : ""}{result.ok ? "OK" : "ERROR"}
      </span>
      <pre className="mt-2 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all max-h-72 overflow-y-auto">
        {raw}
      </pre>
    </div>
  );
}
