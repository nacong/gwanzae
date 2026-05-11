"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Users,
  MapPin,
  Clock,
  CheckCircle2,
  X,
  Loader2,
  Bookmark,
  CalendarDays,
  Building2,
  FileText,
  PackageSearch,
  Phone,
  ScanLine,
} from "lucide-react";
import { cn, DispatchApplication, getCurrentStaffStatus, StaffStatus } from "@/lib/utils";
import { scanApplication, getLogisticsRecommendation, LogisticsRecommendation } from "@/lib/gemini";

const BUILDING_COORDS: Record<string, { x: number; y: number }> = {
  본관: { x: 50, y: 30 },
  공학관: { x: 20, y: 15 },
  경상관: { x: 80, y: 20 },
  인문관: { x: 75, y: 70 },
  자연과학관: { x: 30, y: 75 },
  학생회관: { x: 50, y: 90 },
  미래관: { x: 50, y: 60 },
};

const MapNode = ({ name, isActive }: { name: string; isActive: boolean }) => {
  const c = BUILDING_COORDS[name] || { x: 0, y: 0 };
  return (
    <motion.g initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <circle cx={`${c.x}%`} cy={`${c.y}%`} r="12"
        className={cn("transition-all duration-500", isActive ? "fill-indigo-500" : "fill-slate-800")} />
      {isActive && (
        <motion.circle cx={`${c.x}%`} cy={`${c.y}%`} r="18" className="fill-indigo-500/20"
          animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.2, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }} />
      )}
      <text x={`${c.x}%`} y={`${c.y + 11}%`} textAnchor="middle"
        className="text-[9px] font-bold fill-indigo-200 pointer-events-none">
        {name}
      </text>
    </motion.g>
  );
};

export default function Home() {
  const [staff, setStaff] = useState<StaffStatus>({ count: 0, label: "로딩 중..." });
  const [pendingApplications, setPendingApplications] = useState<DispatchApplication[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<"camera" | "scanning" | "logistics" | "result">("camera");
  const [scannedApp, setScannedApp] = useState<DispatchApplication | null>(null);
  const [recommendation, setRecommendation] = useState<LogisticsRecommendation | null>(null);
  const [completedItemSeqs, setCompletedItemSeqs] = useState<number[]>([]);
  const [time, setTime] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTime(new Date());
      setStaff(getCurrentStaffStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("gwanzae-applications");
    if (saved) setPendingApplications(JSON.parse(saved));
  }, []);

  const saveToStorage = (apps: DispatchApplication[]) => {
    localStorage.setItem("gwanzae-applications", JSON.stringify(apps));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScanStep("scanning");
    try {
      const data = await scanApplication(file);
      const app: DispatchApplication = {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
        status: "pending",
        createdAt: Date.now(),
      };
      setScannedApp(app);
      setCompletedItemSeqs([]);
      setScanStep("logistics");
      const rec = await getLogisticsRecommendation(app, staff.count, pendingApplications);
      setRecommendation(rec);
      setScanStep("result");
    } catch (err) {
      console.error(err);
      setScanError("신청서 인식에 실패했습니다. 다시 시도해 주세요.");
      setScanStep("camera");
    }
  };

  const toggleItem = (seq: number) => {
    setCompletedItemSeqs((prev) => (prev.includes(seq) ? prev.filter((s) => s !== seq) : [...prev, seq]));
  };

  const saveApplication = () => {
    if (!scannedApp) return;
    const updated = [...pendingApplications, scannedApp];
    setPendingApplications(updated);
    saveToStorage(updated);
    setIsScanning(false);
    resetScan();
  };

  const completeApplication = (id: string) => {
    const updated = pendingApplications.filter((a) => a.id !== id);
    setPendingApplications(updated);
    saveToStorage(updated);
  };

  const resetScan = () => {
    setScanStep("camera");
    setScannedApp(null);
    setRecommendation(null);
    setScanError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="flex-1 overflow-x-hidden pb-32 px-4 pt-safe-top">

      {/* ── Header ── */}
      <header className="pt-5 pb-4">
        {/* Title row */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
            관재 AI 출동관리
          </h1>
          {/* Staff badge */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-semibold",
              staff.count > 0
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-red-500/10 border-red-500/30 text-red-400"
            )}
          >
            <Users className="w-3.5 h-3.5" />
            {staff.count}명 근무 중
          </motion.div>
        </div>

        {/* Date / time / staff detail */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <CalendarDays className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>{mounted ? time.toLocaleDateString("ko-KR", { weekday: "short", month: "long", day: "numeric" }) : "--"}</span>
          <span className="opacity-30">·</span>
          <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="tabular-nums">{mounted ? time.toLocaleTimeString("ko-KR") : "--:--:--"}</span>
        </div>
        {staff.count > 0 && (
          <p className="mt-1 text-xs text-slate-600">{staff.label}</p>
        )}
      </header>

      {/* ── Pending list ── */}
      <section className="animate-in" style={{ animationDelay: "0.1s" }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-400 flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-indigo-500" />
            보류 신청서
            {pendingApplications.length > 0 && (
              <span className="ml-1 text-xs bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full">
                {pendingApplications.length}
              </span>
            )}
          </h2>
          {pendingApplications.length > 0 && (
            <button
              onClick={() => { setPendingApplications([]); localStorage.removeItem("gwanzae-applications"); }}
              className="text-xs text-slate-600 active:text-red-400 transition-colors"
            >
              전체 삭제
            </button>
          )}
        </div>

        {pendingApplications.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-slate-500 text-sm">대기 중인 신청서가 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingApplications.map((app) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 rounded-2xl active:border-indigo-500/40 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-200 text-sm truncate">{app.applicationNumber}</div>
                      <div className="text-xs text-slate-500 truncate">{app.department} · {app.applicant}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => completeApplication(app.id)}
                    className="shrink-0 ml-2 text-xs text-slate-500 active:text-green-400 transition-colors px-2 py-1 rounded-lg bg-white/5"
                  >
                    완료
                  </button>
                </div>

                <div className="space-y-1 pl-[42px]">
                  {app.items.map((item) => (
                    <div key={item.seq} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="text-slate-700">{item.seq}.</span>
                      <span className="text-slate-300 font-medium truncate">{item.itemName}</span>
                      <MapPin className="w-2.5 h-2.5 text-slate-600 shrink-0" />
                      <span className="truncate text-slate-600">{item.location}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between mt-2 pt-2 border-t border-white/5 pl-[42px]">
                  <span className="text-[11px] text-slate-600">{app.totalQuantity}점 · {app.totalAmount.toLocaleString()}원</span>
                  <span className="text-[11px] text-slate-600">{app.applicationDate}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ── Floating scan button ── */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-safe-bottom bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/90 to-transparent pt-8 z-40">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setIsScanning(true)}
          className="w-full premium-gradient rounded-2xl py-4 flex items-center justify-center gap-3 font-bold text-white shadow-2xl shadow-indigo-900/50 active:brightness-90 transition-all"
        >
          <ScanLine className="w-5 h-5" />
          신청서 스캔하기
        </motion.button>
      </div>

      {/* ── Bottom-sheet modal ── */}
      <AnimatePresence>
        {isScanning && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setIsScanning(false); resetScan(); }}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
            />

            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#111114] rounded-t-3xl flex flex-col max-h-[92dvh] overflow-hidden"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>

              {/* Sheet header */}
              <div className="px-5 py-3 flex items-center justify-between border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-indigo-500 rounded-lg">
                    <ScanLine className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold">신청서 AI 인식</span>
                </div>
                <button
                  onClick={() => { setIsScanning(false); resetScan(); }}
                  className="p-2 rounded-full active:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Sheet content */}
              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* ── Camera step ── */}
                {scanStep === "camera" && (
                  <div className="p-5 space-y-4">
                    {scanError && (
                      <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl px-4 py-3">
                        {scanError}
                      </div>
                    )}

                    {/* Preview placeholder */}
                    <div className="aspect-[4/3] bg-black rounded-2xl relative overflow-hidden flex items-center justify-center">
                      <div className="text-center">
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 2 }}
                          className="w-16 h-16 border-2 border-indigo-500 rounded-xl mx-auto mb-3 flex items-center justify-center"
                        >
                          <FileText className="w-8 h-8 text-indigo-500" />
                        </motion.div>
                        <p className="text-slate-500 text-sm">물품 불용/반납신청서</p>
                      </div>
                      {/* Corner marks */}
                      <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-indigo-500 rounded-tl-lg" />
                      <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-indigo-500 rounded-tr-lg" />
                      <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-indigo-500 rounded-bl-lg" />
                      <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-indigo-500 rounded-br-lg" />
                    </div>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full premium-gradient py-4 rounded-2xl font-bold active:brightness-90 transition-all shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2"
                    >
                      <Camera className="w-5 h-5" />
                      사진 촬영 / 파일 선택
                    </button>
                  </div>
                )}

                {/* ── Loading ── */}
                {(scanStep === "scanning" || scanStep === "logistics") && (
                  <div className="py-20 flex flex-col items-center justify-center gap-5 text-center px-6">
                    <motion.div
                      animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="text-indigo-500"
                    >
                      <Loader2 className="w-14 h-14" />
                    </motion.div>
                    <div>
                      <h4 className="text-lg font-bold mb-1">
                        {scanStep === "scanning" ? "신청서 인식 중..." : "경로 분석 중..."}
                      </h4>
                      <p className="text-slate-500 text-sm">
                        {scanStep === "scanning"
                          ? "Gemini Vision이 신청서 항목을 읽고 있습니다."
                          : "근무 인원과 위치를 바탕으로 최적 동선을 계산합니다."}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Result ── */}
                {scanStep === "result" && scannedApp && recommendation && (
                  <div className="animate-in">
                    {/* Map */}
                    <div className="bg-[#0b0c14] aspect-video relative border-b border-white/10 overflow-hidden">
                      <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:16px_16px]" />
                      <svg className="absolute inset-0 w-full h-full">
                        <defs>
                          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(99,102,241,0.8)" />
                          </marker>
                          <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#a855f7" />
                          </linearGradient>
                        </defs>
                        {recommendation.route && recommendation.route.length > 1 && (
                          <>
                            <polyline
                              points={recommendation.route.map((b) => { const c = BUILDING_COORDS[b]; return c ? `${c.x}%,${c.y}%` : ""; }).join(" ")}
                              fill="none" stroke="rgba(99,102,241,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            />
                            <motion.polyline
                              points={recommendation.route.map((b) => { const c = BUILDING_COORDS[b]; return c ? `${c.x}%,${c.y}%` : ""; }).join(" ")}
                              fill="none" stroke="url(#pathGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              markerEnd="url(#arrow)"
                              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: "easeInOut" }}
                            />
                          </>
                        )}
                        {Object.keys(BUILDING_COORDS).map((name) => (
                          <MapNode key={name} name={name} isActive={(recommendation.route?.indexOf(name) ?? -1) !== -1} />
                        ))}
                      </svg>
                    </div>

                    <div className="p-5 space-y-4">
                      {/* Application summary */}
                      <div className="p-4 rounded-2xl border bg-white/5 border-white/10 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="font-bold truncate">{scannedApp.applicationNumber}</span>
                          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded-full border border-indigo-500/30 shrink-0">NEW</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
                          <div className="flex items-center gap-1 truncate"><Building2 className="w-3 h-3 shrink-0" />{scannedApp.department}</div>
                          <div className="flex items-center gap-1 truncate"><Users className="w-3 h-3 shrink-0" />{scannedApp.applicant}</div>
                          <div className="flex items-center gap-1 truncate"><Phone className="w-3 h-3 shrink-0" />{scannedApp.contact}</div>
                          <div className="flex items-center gap-1 truncate"><CalendarDays className="w-3 h-3 shrink-0" />{scannedApp.applicationDate}</div>
                        </div>
                        <div className="text-xs text-slate-600 pt-1 border-t border-white/5">
                          총 {scannedApp.totalQuantity}점 · {scannedApp.totalAmount.toLocaleString()}원
                        </div>
                      </div>

                      {/* Recommendation */}
                      <div className={cn(
                        "p-4 rounded-2xl border flex items-center gap-3",
                        recommendation.shouldDispatch ? "bg-green-500/10 border-green-500/20" : "bg-orange-500/10 border-orange-500/20"
                      )}>
                        <div className={cn("p-2.5 rounded-xl shrink-0", recommendation.shouldDispatch ? "bg-green-500" : "bg-orange-500")}>
                          {recommendation.shouldDispatch
                            ? <CheckCircle2 className="text-white w-5 h-5" />
                            : <Clock className="text-white w-5 h-5" />}
                        </div>
                        <div>
                          <div className="font-bold">{recommendation.shouldDispatch ? "즉시 출동 가능" : "출동 보류 권장"}</div>
                          <p className="text-xs opacity-70 mt-0.5">
                            {recommendation.shouldDispatch ? "아래 물품 목록을 확인 후 출동하세요." : recommendation.reason}
                          </p>
                        </div>
                      </div>

                      {/* Item checklist */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                          <PackageSearch className="w-3.5 h-3.5" />
                          물품 체크리스트 ({completedItemSeqs.length}/{scannedApp.items.length})
                        </h4>
                        {scannedApp.items.map((item) => {
                          const done = completedItemSeqs.includes(item.seq);
                          return (
                            <div
                              key={item.seq}
                              onClick={() => toggleItem(item.seq)}
                              className={cn(
                                "p-3.5 rounded-xl border transition-all active:scale-[0.98] cursor-pointer select-none",
                                done ? "bg-green-500/10 border-green-500/30 opacity-60" : "bg-white/5 border-white/10 active:bg-white/10"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <span className={cn("font-semibold text-sm truncate", done && "line-through text-slate-500")}>
                                      {item.itemName}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-slate-500">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{item.location}</span>
                                  </div>
                                  <div className="text-[11px] text-slate-700 mt-0.5 truncate">{item.assetNumber} · {item.spec}</div>
                                </div>
                                {done && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3 pt-1 pb-safe-bottom">
                        <button
                          onClick={() => { setIsScanning(false); resetScan(); }}
                          className="flex-1 bg-white/10 active:bg-white/20 py-4 rounded-2xl font-bold transition-all text-slate-400 text-sm"
                        >
                          닫기
                        </button>
                        <button
                          onClick={saveApplication}
                          className="flex-[2] premium-gradient py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-900/40 active:brightness-90 text-sm"
                        >
                          {recommendation.shouldDispatch ? "출동 시작 & 저장" : "보류 저장"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
