"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Users, Clock, CheckCircle2, X, Loader2, CalendarDays,
  FileText, ScanLine, Truck, MapPin, AlertCircle, Navigation,
  Timer, ChevronRight, Package,
} from "lucide-react";
import {
  cn, DispatchApplication, DispatchTimeGroup,
  getCurrentStaffStatus, StaffStatus,
} from "@/lib/utils";
import { scanApplication } from "@/lib/gemini";

// ─── Mock 최적화 ────────────────────────────────────────────────────────────
function mockOptimize(apps: DispatchApplication[]): DispatchTimeGroup[] {
  if (apps.length === 0) return [];
  const dateStr = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const extractRoute = (group: DispatchApplication[]) =>
    Array.from(new Set(group.flatMap(a => a.물품목록.map(i => i.설치장소.split(" ")[0]))));
  const half = Math.ceil(apps.length / 2);
  const groups: DispatchTimeGroup[] = [{
    id: Math.random().toString(36).substr(2, 9),
    scheduledDateTime: `${dateStr} 오전 10:00`,
    applications: apps.slice(0, half),
    isDispatched: false,
    optimizedRoute: extractRoute(apps.slice(0, half)),
  }];
  if (apps.length > 1) groups.push({
    id: Math.random().toString(36).substr(2, 9),
    scheduledDateTime: `${dateStr} 오후 2:00`,
    applications: apps.slice(half),
    isDispatched: false,
    optimizedRoute: extractRoute(apps.slice(half)),
  });
  return groups;
}

type ScanStep = "camera" | "scanning" | "review";
type ScannedData = Omit<DispatchApplication, "id" | "status" | "createdAt" | "requiredPersonnel">;

export default function Home() {
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
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
      const data = await scanApplication(selectedFiles);
      setScannedData(data);
      setMetaInput({ 신청번호: data.신청번호, 신청부서: data.신청부서, 신청일자: data.신청일자 });
      const inputs: Record<number, string> = {};
      data.물품목록.forEach((item, i) => {
        inputs[i] = item.필요인원수 > 0 ? String(item.필요인원수) : "";
      });
      setItemPersonnelInput(inputs);
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
    setScanOpen(false); resetScan();
  };

  const handleOptimize = async () => {
    if (unoptimizedApps.length === 0 || isOptimizing) return;
    setIsOptimizing(true);
    await new Promise(r => setTimeout(r, 1200));
    saveTimeGroups([...timeGroups, ...mockOptimize(unoptimizedApps)]);
    saveUnoptimized([]);
    setIsOptimizing(false);
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
                          onClick={() => dispatchGroup(group.id)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white text-indigo-600 active:bg-indigo-50 transition-colors"
                        >
                          <Truck className="w-3.5 h-3.5" />
                          출동
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/20 text-white">
                          <Truck className="w-3.5 h-3.5" />
                          출동 중
                        </div>
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
                    return v >= 1;
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
                            <div key={i} className="bg-white rounded-xl px-3 py-2.5 flex items-center gap-2">
                              <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800">
                                  {item.품명}
                                  <span className="ml-1.5 font-normal text-slate-400">×{item.수량}</span>
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">{item.설치장소}</p>
                              </div>
                              <div className="shrink-0 flex items-center gap-1">
                                <input
                                  type="number" min="1" max="99"
                                  value={itemPersonnelInput[i] ?? ""}
                                  onChange={e => setItemPersonnelInput(prev => ({ ...prev, [i]: e.target.value }))}
                                  placeholder="0"
                                  className="w-12 text-center bg-indigo-50 border border-indigo-200 rounded-xl px-1 py-1.5 text-sm font-black text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                                <span className="text-xs text-slate-400">명</span>
                              </div>
                            </div>
                          ))}
                          {!allFilled && (
                            <p className="text-[11px] text-amber-500 pt-1">
                              ⚠ 필요 인원 수를 입력해 주세요.
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
    </main>
  );
}
