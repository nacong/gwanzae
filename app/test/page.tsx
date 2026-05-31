"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://dynamic-coaching-venues-nickel.trycloudflare.com";

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

const DEFAULT_PRODUCT = JSON.stringify(
  { "품명": "냉장고", "필요인원수": 4 },
  null, 2
);

const DEFAULT_PRODUCT_UPDATE = JSON.stringify(
  { "필요인원수": 3 },
  null, 2
);

const DEFAULT_S3_KEY = JSON.stringify(
  { "s3_key": "products/2025-09-17.csv" },
  null, 2
);

const DEFAULT_ROUTE_REQUEST = JSON.stringify(
  {
    "투입인원수": 3,
    "신청서": [
      { "품명": "키보드", "설치장소": "외국어대학관 124", "수량": 2, "필요인원수": 1 },
      { "품명": "냉장고", "설치장소": "외국어대학관 234", "수량": 2, "필요인원수": 4 },
      { "품명": "책장 목재", "설치장소": "공학실험동 220", "수량": 1, "필요인원수": 2 },
      { "품명": "제빙기", "설치장소": "공학실험동 120", "수량": 1, "필요인원수": 2 }
    ]
  },
  null, 2
);

export default function TestPage() {
  // Health
  const [healthResult, setHealthResult] = useState<Result | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Optimize
  const [optimizeResult, setOptimizeResult] = useState<Result | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [applications, setApplications] = useState(DEFAULT_APPLICATIONS);
  const [appError, setAppError] = useState<string | null>(null);

  // Products GET
  const [productsResult, setProductsResult] = useState<Result | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  // Products Workers GET
  const [workersResult, setWorkersResult] = useState<Result | null>(null);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workersPumyeong, setWorkersPumyeong] = useState("냉장고");

  // Products POST
  const [createProductResult, setCreateProductResult] = useState<Result | null>(null);
  const [createProductLoading, setCreateProductLoading] = useState(false);
  const [productBody, setProductBody] = useState(DEFAULT_PRODUCT);
  const [productBodyError, setProductBodyError] = useState<string | null>(null);

  // Products PATCH
  const [patchResult, setPatchResult] = useState<Result | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchName, setPatchName] = useState("냉장고");
  const [patchBody, setPatchBody] = useState(DEFAULT_PRODUCT_UPDATE);
  const [patchBodyError, setPatchBodyError] = useState<string | null>(null);

  // Products Import
  const [importResult, setImportResult] = useState<Result | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importBody, setImportBody] = useState(DEFAULT_S3_KEY);
  const [importBodyError, setImportBodyError] = useState<string | null>(null);

  // Optimize Route
  const [routeResult, setRouteResult] = useState<Result | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeBody, setRouteBody] = useState(DEFAULT_ROUTE_REQUEST);
  const [routeBodyError, setRouteBodyError] = useState<string | null>(null);

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
    let parsedApps: unknown;
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
    setOptimizeLoading(true);
    setOptimizeResult(null);
    try {
      const res = await fetch(`${API_BASE}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedApps),
      });
      const data = await res.json();
      setOptimizeResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setOptimizeResult({ ok: false, error: String(e) });
    } finally {
      setOptimizeLoading(false);
    }
  }

  async function fetchWorkers() {
    if (!workersPumyeong.trim()) return;
    setWorkersLoading(true);
    setWorkersResult(null);
    try {
      const res = await fetch(
        `${API_BASE}/products/workers?${new URLSearchParams({ 품명: workersPumyeong.trim() })}`
      );
      const data = await res.json();
      setWorkersResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setWorkersResult({ ok: false, error: String(e) });
    } finally {
      setWorkersLoading(false);
    }
  }

  async function fetchProducts() {
    setProductsLoading(true);
    setProductsResult(null);
    try {
      const res = await fetch(`${API_BASE}/products`);
      const data = await res.json();
      setProductsResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setProductsResult({ ok: false, error: String(e) });
    } finally {
      setProductsLoading(false);
    }
  }

  async function createProduct() {
    setProductBodyError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(productBody);
    } catch {
      setProductBodyError("유효한 JSON을 입력하세요.");
      return;
    }
    setCreateProductLoading(true);
    setCreateProductResult(null);
    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setCreateProductResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setCreateProductResult({ ok: false, error: String(e) });
    } finally {
      setCreateProductLoading(false);
    }
  }

  async function patchProduct() {
    setPatchBodyError(null);
    if (!patchName.trim()) {
      setPatchBodyError("품명을 입력하세요.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(patchBody);
    } catch {
      setPatchBodyError("유효한 JSON을 입력하세요.");
      return;
    }
    setPatchLoading(true);
    setPatchResult(null);
    try {
      const res = await fetch(`${API_BASE}/products/${encodeURIComponent(patchName.trim())}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setPatchResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setPatchResult({ ok: false, error: String(e) });
    } finally {
      setPatchLoading(false);
    }
  }

  async function optimizeRoute() {
    setRouteBodyError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(routeBody);
    } catch {
      setRouteBodyError("유효한 JSON을 입력하세요.");
      return;
    }
    setRouteLoading(true);
    setRouteResult(null);
    try {
      const res = await fetch(`${API_BASE}/optimize/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setRouteResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setRouteResult({ ok: false, error: String(e) });
    } finally {
      setRouteLoading(false);
    }
  }

  async function importProducts() {
    setImportBodyError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importBody);
    } catch {
      setImportBodyError("유효한 JSON을 입력하세요.");
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API_BASE}/products/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setImportResult({ ok: res.ok, status: res.status, data });
    } catch (e) {
      setImportResult({ ok: false, error: String(e) });
    } finally {
      setImportLoading(false);
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
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">POST</span>
            <span className="font-semibold text-gray-700">/optimize</span>
            <span className="ml-2 text-xs text-gray-400">body: OptimizeRequest[]</span>
          </div>
          <button
            onClick={runOptimize}
            disabled={optimizeLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {optimizeLoading ? "처리 중..." : "Send"}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            신청서 목록
            <span className="ml-1.5 font-normal text-gray-400">— OptimizeRequest[]</span>
          </label>
          <textarea
            value={applications}
            onChange={e => { setApplications(e.target.value); setAppError(null); }}
            rows={18}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${appError ? "border-red-400" : "border-gray-200"}`}
          />
          {appError && <p className="text-red-500 text-xs mt-1">{appError}</p>}
        </div>
        {optimizeResult && <ResultBox result={optimizeResult} />}
      </section>

      {/* Products GET */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded mr-2">GET</span>
            <span className="font-semibold text-gray-700">/products</span>
            <span className="ml-2 text-xs text-gray-400">?skip=0&amp;limit=100</span>
          </div>
          <button
            onClick={fetchProducts}
            disabled={productsLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {productsLoading ? "요청 중..." : "Send"}
          </button>
        </div>
        {productsResult && <ResultBox result={productsResult} />}
      </section>

      {/* Products Workers GET */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded">GET</span>
            <span className="font-semibold text-gray-700">/products/workers</span>
            <span className="text-gray-400 text-xs">?품명=</span>
            <input
              value={workersPumyeong}
              onChange={e => setWorkersPumyeong(e.target.value)}
              placeholder="품명"
              className="border-b border-gray-300 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none focus:border-gray-700 w-24"
            />
          </div>
          <button
            onClick={fetchWorkers}
            disabled={workersLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {workersLoading ? "요청 중..." : "Send"}
          </button>
        </div>
        {workersResult && <ResultBox result={workersResult} />}
      </section>

      {/* Products POST */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">POST</span>
            <span className="font-semibold text-gray-700">/products</span>
            <span className="ml-2 text-xs text-gray-400">body: ProductCreate</span>
          </div>
          <button
            onClick={createProduct}
            disabled={createProductLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {createProductLoading ? "처리 중..." : "Send"}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            body
            <span className="ml-1.5 font-normal text-gray-400">— 품명, 필요인원수</span>
          </label>
          <textarea
            value={productBody}
            onChange={e => { setProductBody(e.target.value); setProductBodyError(null); }}
            rows={5}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${productBodyError ? "border-red-400" : "border-gray-200"}`}
          />
          {productBodyError && <p className="text-red-500 text-xs mt-1">{productBodyError}</p>}
        </div>
        {createProductResult && <ResultBox result={createProductResult} />}
      </section>

      {/* Products PATCH */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded mr-2">PATCH</span>
            <span className="font-semibold text-gray-700">/products/</span>
            <input
              value={patchName}
              onChange={e => setPatchName(e.target.value)}
              placeholder="품명"
              className="ml-0.5 border-b border-gray-300 bg-transparent text-sm font-semibold text-gray-700 focus:outline-none focus:border-gray-700 w-32"
            />
          </div>
          <button
            onClick={patchProduct}
            disabled={patchLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {patchLoading ? "처리 중..." : "Send"}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            body
            <span className="ml-1.5 font-normal text-gray-400">— ProductUpdate (품명, 필요인원수 모두 optional)</span>
          </label>
          <textarea
            value={patchBody}
            onChange={e => { setPatchBody(e.target.value); setPatchBodyError(null); }}
            rows={5}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${patchBodyError ? "border-red-400" : "border-gray-200"}`}
          />
          {patchBodyError && <p className="text-red-500 text-xs mt-1">{patchBodyError}</p>}
        </div>
        {patchResult && <ResultBox result={patchResult} />}
      </section>

      {/* Optimize Route */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">POST</span>
            <span className="font-semibold text-gray-700">/optimize/route</span>
            <span className="ml-2 text-xs text-gray-400">body: RouteRequest</span>
          </div>
          <button
            onClick={optimizeRoute}
            disabled={routeLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {routeLoading ? "처리 중..." : "Send"}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            body
            <span className="ml-1.5 font-normal text-gray-400">— 투입인원수(optional), 신청서: RouteItem[]</span>
          </label>
          <textarea
            value={routeBody}
            onChange={e => { setRouteBody(e.target.value); setRouteBodyError(null); }}
            rows={16}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${routeBodyError ? "border-red-400" : "border-gray-200"}`}
          />
          {routeBodyError && <p className="text-red-500 text-xs mt-1">{routeBodyError}</p>}
        </div>
        {routeResult && <ResultBox result={routeResult} />}
      </section>

      {/* Products Import */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">POST</span>
            <span className="font-semibold text-gray-700">/products/import</span>
            <span className="ml-2 text-xs text-gray-400">body: ImportRequest</span>
          </div>
          <button
            onClick={importProducts}
            disabled={importLoading}
            className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 transition"
          >
            {importLoading ? "처리 중..." : "Send"}
          </button>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            body
            <span className="ml-1.5 font-normal text-gray-400">— s3_key: string</span>
          </label>
          <textarea
            value={importBody}
            onChange={e => { setImportBody(e.target.value); setImportBodyError(null); }}
            rows={3}
            spellCheck={false}
            className={`w-full rounded-lg border px-3 py-2 text-xs bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y ${importBodyError ? "border-red-400" : "border-gray-200"}`}
          />
          {importBodyError && <p className="text-red-500 text-xs mt-1">{importBodyError}</p>}
        </div>
        {importResult && <ResultBox result={importResult} />}
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
