"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Users, Clock, CheckCircle2, X, Loader2,
  FileText, ScanLine, Truck, MapPin, AlertCircle, Navigation,
  Timer, ChevronRight, Package, ArrowRight, RefreshCw,
} from "lucide-react";
import {
  cn, DispatchApplication, DispatchTimeGroup,
  getCurrentStaffStatus, StaffStatus,
} from "@/lib/utils";
import { scanApplication } from "@/lib/gemini";
import { fetchWorkers, optimizeRoute, updateProduct, createProduct } from "@/lib/db";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** 다양한 날짜 포맷을 "YYYY-MM-DD"로 통일 */
function normalizeDate(dateStr: string): string {
  if (!dateStr) return "날짜 미정";
  const cleaned = dateStr
    .replace(/년\s*/g, "-")
    .replace(/월\s*/g, "-")
    .replace(/일/g, "")
    .replace(/\./g, "-")
    .replace(/\s+/g, "")
    .trim();
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  return dateStr;
}

type ScanStep = "camera" | "scanning" | "review";
type ScannedData = Omit<DispatchApplication, "id" | "status" | "createdAt" | "requiredPersonnel">;

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
  const [metaInput, setMetaInput] = useState({ 신청번호: "", 신청부서: "", 신청일자: "" });
  const [itemPersonnelInput, setItemPersonnelInput] = useState<Record<number, string>>({});
  const [itemNameInput, setItemNameInput] = useState<Record<number, string>>({});
  const [itemQuantityInput, setItemQuantityInput] = useState<Record<number, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [serverPersonnel, setServerPersonnel] = useState<Record<string, number>>({});

  // 출동 팝업
  const [dispatchPopup, setDispatchPopup] = useState<DispatchTimeGroup | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<unknown>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => { setTime(new Date()); setStaff(getCurrentStaffStatus()); }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const u = localStorage.getItem("gwanzae-unoptimized");
      if (u) {
        const parsed = JSON.parse(u);
        // 구 형식(items 필드) 데이터 제거
        const valid = parsed.filter((a: DispatchApplication) => Array.isArray(a.물품목록));
        setUnoptimizedApps(valid);
      }
      const g = localStorage.getItem("gwanzae-timegroups");
      if (g) {
        const parsed = JSON.parse(g);
        const valid = parsed.filter((g: { applications: DispatchApplication[] }) =>
          g.applications.every((a: DispatchApplication) => Array.isArray(a.물품목록))
        );
        setTimeGroups(valid);
      }
    } catch { /* ignore */ }
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
    setMetaInput({ 신청번호: "", 신청부서: "", 신청일자: "" });
    setItemPersonnelInput({});
    setItemNameInput({});
    setItemQuantityInput({});
    setServerPersonnel({});
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

  const handleStartScan = async () => {
    if (selectedFiles.length === 0) return;
    setScanError(null); setScanStep("scanning");
    try {
      // Gemini 스캔 실행
      const data = await scanApplication(selectedFiles);
      setScannedData(data);
      setMetaInput({ 신청번호: data.신청번호, 신청부서: data.신청부서, 신청일자: data.신청일자 });

      // 품명별로 GET /products/workers 병렬 호출 → 저장된 필요인원수 우선 사용
      const workerResults = await Promise.all(
        data.물품목록.map(item => fetchWorkers(item.품명).catch(() => null))
      );

      const inputs: Record<number, string> = {};
      const nameInputs: Record<number, string> = {};
      const serverMap: Record<string, number> = {};
      data.물품목록.forEach((item, i) => {
        const w = workerResults[i];
        let stored: number | null = null;
        if (typeof w === "number") {
          stored = w;
        } else if (w && typeof w === "object") {
          const obj = w as Record<string, unknown>;
          const val = obj["필요인원수"] ?? obj["workers"] ?? obj["count"] ?? obj["인원수"];
          if (typeof val === "number") stored = val;
          else if (typeof val === "string") stored = parseInt(val, 10) || null;
        }
        console.log(`[fetchWorkers] 품명=${item.품명}`, w, "→ stored:", stored);
        if (stored != null && stored > 0) serverMap[item.품명] = stored;
        inputs[i] = stored != null && stored > 0
          ? String(stored)
          : item.필요인원수 > 0 ? String(item.필요인원수) : "";
        nameInputs[i] = item.품명;
      });
      const quantityInputs: Record<number, string> = {};
      data.물품목록.forEach((item, i) => { quantityInputs[i] = String(item.수량); });
      setServerPersonnel(serverMap);
      setItemPersonnelInput(inputs);
      setItemNameInput(nameInputs);
      setItemQuantityInput(quantityInputs);
      setScanStep("review");
    } catch (err) {
      console.error("[scanApplication error]", err);
      setScanError(`인식 실패: ${err instanceof Error ? err.message : String(err)}`);
      setScanStep("camera");
    }
  };

  const handleSaveApplication = () => {
    if (!scannedData) return;
    const updatedItems = scannedData.물품목록.map((item, i) => ({
      ...item,
      품명: (itemNameInput[i] ?? item.품명).trim() || item.품명,
      수량: parseInt(itemQuantityInput[i] ?? "", 10) || item.수량,
      필요인원수: parseInt(itemPersonnelInput[i] ?? "", 10) || item.필요인원수,
    }));
    const requiredPersonnel = Math.max(...updatedItems.map(it => it.필요인원수), 0);
    saveUnoptimized([...unoptimizedApps, {
      ...scannedData,
      ...metaInput,
      물품목록: updatedItems,
      id: Math.random().toString(36).substr(2, 9),
      requiredPersonnel,
      status: "unoptimized",
      createdAt: Date.now(),
    }]);

    // 서버 동기화: 품목이 DB에 있으면 PATCH, 없으면 POST
    updatedItems.forEach((item, i) => {
      const originalName = scannedData.물품목록[i].품명;
      const serverVal = serverPersonnel[originalName];

      if (serverVal !== undefined) {
        // DB에 있는 품목 — 이름이나 인원수가 바뀐 경우만 PATCH
        const nameChanged = item.품명 !== originalName;
        const personnelChanged = serverVal !== item.필요인원수;
        if (nameChanged || personnelChanged) {
          const patch: { 품명?: string; 필요인원수?: number } = {};
          if (nameChanged) patch.품명 = item.품명;
          if (personnelChanged) patch.필요인원수 = item.필요인원수;
          updateProduct(originalName, patch).catch(err =>
            console.error(`[updateProduct ${originalName}]`, err)
          );
        }
      } else if (item.필요인원수 > 0) {
        // DB에 없는 신규 품목 — POST로 등록
        createProduct({ 품명: item.품명, 필요인원수: item.필요인원수 }).catch(err =>
          console.error(`[createProduct ${item.품명}]`, err)
        );
      }
    });

    setScanOpen(false); resetScan();
  };

  const handleOptimize = async () => {
    if (unoptimizedApps.length === 0 || isOptimizing) return;
    setIsOptimizing(true);

    // 1) POST /optimize — 일정 저장
    try {
      const payload = unoptimizedApps.map(app => ({
        신청번호: app.신청번호,
        신청일자: app.신청일자,
        신청부서: app.신청부서,
        물품목록: app.물품목록.map(item => ({
          품명: item.품명,
          설치장소: item.설치장소,
          수량: item.수량,
          필요인원수: item.필요인원수,
        })),
      }));
      await fetch(`${API_BASE}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error("[optimize API error]", err);
    }

    // 2) 신청일자 기준 그룹핑
    const dateMap = new Map<string, DispatchApplication[]>();
    for (const app of unoptimizedApps) {
      const key = normalizeDate(app.신청일자);
      if (!dateMap.has(key)) dateMap.set(key, []);
      dateMap.get(key)!.push(app);
    }

    // 3) 그룹별로 POST /optimize/route → 서버 최적 동선, 실패 시 클라이언트 폴백
    const newGroups: DispatchTimeGroup[] = await Promise.all(
      Array.from(dateMap.entries()).map(async ([date, apps]) => {
        const fallbackRoute = Array.from(new Set(
          apps.flatMap(a => a.물품목록.map(i => i.설치장소.split(" ")[0]))
        ));
        let optimizedRoute = fallbackRoute;
        try {
          const routeRes = await optimizeRoute({
            투입인원수: staff.count > 0 ? staff.count : null,
            신청서: apps.flatMap(a => a.물품목록.map(item => ({
              품명: item.품명,
              설치장소: item.설치장소,
              수량: item.수량,
              필요인원수: item.필요인원수,
            }))),
          });
          // 서버가 string[] 형태의 동선을 반환하면 사용
          if (Array.isArray(routeRes) && routeRes.every(r => typeof r === "string")) {
            optimizedRoute = routeRes as string[];
          }
        } catch (err) {
          console.error("[optimizeRoute API error]", err);
        }
        return {
          id: Math.random().toString(36).substr(2, 9),
          scheduledDateTime: date,
          applications: apps,
          isDispatched: false,
          optimizedRoute,
        };
      })
    );

    saveTimeGroups([...timeGroups, ...newGroups]);
    saveUnoptimized([]);
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

  return (
    <main className="flex-1 overflow-x-hidden pb-28 px-4 pt-safe-top">

      {/* ── 헤더 ── */}
      <header className="pt-6 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-indigo-400 mb-0.5 tracking-wide">
              {mounted ? time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" }) : "--"}
            </p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">관재 AI 출동관리</h1>
          </div>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "mt-1 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold",
              staff.count > 0 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            {staff.count}명 근무
          </motion.div>
        </div>

        {staff.count > 0 && (
          <p className="mt-2 text-xs text-slate-400 leading-relaxed">{staff.label}</p>
        )}

        {/* 실시간 시계 */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 text-indigo-300" />
          <span className="tabular-nums font-medium">{mounted ? time.toLocaleTimeString("ko-KR") : "--:--:--"}</span>
        </div>
      </header>

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
        <section className="mb-7">
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
          className="flex flex-col items-center justify-center py-20 text-center"
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
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

      <div className="fixed bottom-0 left-0 right-0 px-4 pt-5 pb-safe-bottom bg-gradient-to-t from-[#eef0f8] via-[#eef0f8]/95 to-transparent z-40">
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
                      <div className="aspect-[4/3] bg-slate-100 rounded-2xl relative flex flex-col items-center justify-center gap-3 overflow-hidden">
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
                      </div>
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
                      <p className="text-slate-400 text-sm">Gemini Vision이 신청서를 분석하고 있습니다.</p>
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
                          onClick={handleSaveApplication}
                          disabled={!allFilled}
                          className={cn(
                            "flex-[2] py-4 rounded-2xl font-bold text-sm transition-all",
                            allFilled ? "bg-indigo-600 text-white active:bg-indigo-700" : "bg-slate-200 text-slate-400"
                          )}
                        >
                          저장하기
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
    </main>
  );
}
