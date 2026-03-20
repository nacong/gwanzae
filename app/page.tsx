"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Camera, 
  Users, 
  MapPin, 
  ClipboardList, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  X, 
  Scan, 
  Loader2,
  Bookmark,
  ChevronRight,
  Navigation,
  CalendarDays,
  Building2,
  PackageSearch
} from "lucide-react";
import { cn, DispatchTask, getCurrentStaffStatus, StaffStatus } from "@/lib/utils";
import { processImageWithOCR, getLogisticsRecommendation, LogisticsRecommendation } from "@/lib/gemini";

const BUILDING_COORDS: Record<string, { x: number, y: number }> = {
  "본관": { x: 50, y: 30 },
  "공학관": { x: 20, y: 15 },
  "경상관": { x: 80, y: 20 },
  "인문관": { x: 75, y: 70 },
  "자연과학관": { x: 30, y: 75 },
  "학생회관": { x: 50, y: 90 },
  "미래관": { x: 50, y: 60 }
};

interface MapNodeProps {
  name: string;
  isActive: boolean;
  isOrigin?: boolean;
}

const MapNode = ({ name, isActive, isOrigin }: MapNodeProps) => {
  const coords = BUILDING_COORDS[name] || { x: 0, y: 0 };
  return (
    <motion.g 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="cursor-pointer"
    >
      <circle 
        cx={`${coords.x}%`} 
        cy={`${coords.y}%`} 
        r="14" 
        className={cn(
            "transition-all duration-500",
            isActive ? "fill-indigo-500 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]" : "fill-slate-800",
            isOrigin && "stroke-white/20 stroke-1"
        )} 
      />
      <motion.circle 
        cx={`${coords.x}%`} 
        cy={`${coords.y}%`} 
        r={isActive ? "20" : "0"} 
        className="fill-indigo-500/20"
        animate={{
            scale: [1, 1.4, 1],
            opacity: [0.5, 0.2, 0.5]
        }}
        transition={{ repeat: Infinity, duration: 2 }}
      />
      <text 
        x={`${coords.x}%`} 
        y={`${coords.y + 12}%`} 
        textAnchor="middle" 
        className="text-[10px] font-bold fill-indigo-200 pointer-events-none drop-shadow-md"
      >
        {name}
      </text>
    </motion.g>
  );
};

export default function Home() {
  const [staff, setStaff] = useState<StaffStatus>({ count: 0, label: "데이터 로딩 중..." });
  const [pendingTasks, setPendingTasks] = useState<DispatchTask[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState<'camera' | 'ocr' | 'logistics' | 'result'>('camera');
  const [currentTasks, setCurrentTasks] = useState<Partial<DispatchTask>[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<LogisticsRecommendation | null>(null);
  const [time, setTime] = useState<Date>(new Date());
  const [mounted, setMounted] = useState(false);
  
  // Real-time clock and staff update
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTime(new Date());
      setStaff(getCurrentStaffStatus());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("gwanzae-tasks");
    if (saved) {
      setPendingTasks(JSON.parse(saved));
    }
  }, []);

  const saveToLocalStorage = (tasks: DispatchTask[]) => {
    localStorage.setItem("gwanzae-tasks", JSON.stringify(tasks));
  };

  const handleTakePhoto = async () => {
    setScanStep('ocr');
    const tasksData = await processImageWithOCR(new File([], "scan.jpg"));
    setCurrentTasks(tasksData);
    setCompletedTaskIds([]); // Reset checklist
    
    setScanStep('logistics');
    const logs = await getLogisticsRecommendation(tasksData, staff.count, pendingTasks);
    setRecommendation(logs);
    
    setScanStep('result');
  };

  const toggleTaskCompletion = (id: string) => {
    setCompletedTaskIds(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const saveTasks = () => {
    // Collect all tasks that are currently being analyzed
    const combinedTasksList = [...currentTasks, ...pendingTasks];
    
    // Remaining uncompleted tasks (both new and old)
    const remainingTasks: DispatchTask[] = combinedTasksList
      .filter(t => !completedTaskIds.includes(t.itemNumber || ""))
      .map(t => {
          // If it's already a DispatchTask (has id), keep it. Otherwise create new.
          if ('id' in t) return t as DispatchTask;
          return {
            id: Math.random().toString(36).substr(2, 9),
            applicant: t.applicant || "Unknown",
            itemNumber: t.itemNumber || "N/A",
            itemName: t.itemName || "물품정보 없음",
            location: t.location || "위치 알 수 없음",
            status: 'pending' as const,
            createdAt: Date.now(),
          };
      });
      
    setPendingTasks(remainingTasks);
    saveToLocalStorage(remainingTasks);
    setIsScanning(false);
    resetScan();
  };

  const resetScan = () => {
    setScanStep('camera');
    setCurrentTasks([]);
    setRecommendation(null);
  };

  return (
    <main className="flex-1 overflow-x-hidden pt-8 pb-20 px-4 md:px-8 max-w-5xl mx-auto w-full">
      {/* Header Section */}
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-bold tracking-tight mb-2 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
          >
            관재 AI 출동관리 시스템
          </motion.h1>
          <div className="flex items-center gap-4 text-slate-400">
            <div className="flex items-center gap-1.5 backdrop-blur-md bg-white/5 py-1 px-3 rounded-full border border-white/10 h-8">
              <CalendarDays className="w-4 h-4 text-indigo-400" />
              <span className="text-sm min-w-[120px]">
                {mounted ? time.toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "--"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 backdrop-blur-md bg-white/5 py-1 px-3 rounded-full border border-white/10 h-8">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span className="text-sm min-w-[100px]">
                {mounted ? time.toLocaleTimeString('ko-KR') : "--:--:--"}
              </span>
            </div>
          </div>
        </div>
        
        <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
                "p-4 rounded-2xl glass-card flex items-center gap-4 border-l-4",
                staff.count > 0 ? "border-l-green-500" : "border-l-red-500"
            )}
        >
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Users className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <div className="text-xs text-indigo-300 font-medium uppercase tracking-wider mb-0.5">현재 근무 인원</div>
            <div className="text-xl font-bold flex items-center gap-2">
              {staff.count}명
            </div>
          </div>
        </motion.div>
      </header>

      {/* Main Actions */}
      <div className="mb-12">
        <motion.button
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: 0.99 }}
          onClick={() => setIsScanning(true)}
          className="group relative overflow-hidden rounded-[32px] p-10 w-full bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-2xl shadow-indigo-900/40"
        >
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 text-left">
            <div className="flex flex-col gap-6">
              <div className="p-4 bg-white/20 rounded-2xl w-fit group-hover:rotate-12 transition-transform duration-500">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-white mb-3">신규 출동 의뢰 시작하기</h2>
                <p className="text-indigo-100/70 text-base leading-relaxed max-w-[400px]">
                  사진 촬영 한 번으로 물품 정보를 자동 인식하고, 최적의 출동 경로를 분석하여 효율적인 업무 처리를 돕습니다.
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 bg-white/10 hover:bg-white/20 px-6 py-4 rounded-2xl transition-colors shrink-0">
               <span className="font-bold text-white">스캔 시작</span>
               <ArrowRight className="w-5 h-5 text-indigo-200 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
          
          <div className="absolute -bottom-24 -right-12 w-64 h-64 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors" />
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-indigo-400/10 rounded-full blur-2xl" />
        </motion.button>
      </div>

      {/* Pending Tasks List */}
      <section className="animate-in" style={{ animationDelay: '0.2s' }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-indigo-500" />
            보류 리스트
          </h3>
          {pendingTasks.length > 0 && (
            <button 
                onClick={() => {
                    setPendingTasks([]);
                    localStorage.removeItem("gwanzae-tasks");
                }}
                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
            >
                전체 삭제
            </button>
          )}
        </div>

        {pendingTasks.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border-dashed">
            <div className="inline-flex items-center justify-center p-4 rounded-full bg-slate-800/50 mb-4">
              <CheckCircle2 className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-500">현재 대기 중인 출동 건이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingTasks.map((task) => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass-card p-4 rounded-2xl group hover:border-indigo-500/50 transition-colors cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200">{task.itemName}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <span>{task.location}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span>{task.applicant}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Status</div>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                      PENDING
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Modal - Scanning/Analysis */}
      <AnimatePresence>
        {isScanning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsScanning(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl glass-card rounded-[32px] overflow-hidden flex flex-col max-h-[95vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500 rounded-lg">
                        <Scan className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-bold text-lg">AI 출동 지능형 분석</h3>
                </div>
                <button 
                  onClick={() => setIsScanning(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {scanStep === 'camera' && (
                  <div className="p-8 space-y-6">
                    <div className="aspect-[16/10] bg-black rounded-3xl relative overflow-hidden flex items-center justify-center group">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                      <div className="relative text-center p-8">
                        <motion.div 
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 2 }}
                          className="w-20 h-20 border-2 border-indigo-500 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                        >
                          <Camera className="w-10 h-10 text-indigo-500" />
                        </motion.div>
                        <p className="text-slate-400 text-sm">신청서 또는 물품의 사진을 촬영하세요.</p>
                      </div>
                      <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-indigo-500 rounded-tl-xl" />
                      <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-indigo-500 rounded-tr-xl" />
                      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-indigo-500 rounded-bl-xl" />
                      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-indigo-500 rounded-br-xl" />
                    </div>
                    <button
                      onClick={handleTakePhoto}
                      className="w-full premium-gradient p-5 rounded-3xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-indigo-500/20"
                    >
                      AI 이미지 분석 시작
                    </button>
                  </div>
                )}

                {(scanStep === 'ocr' || scanStep === 'logistics') && (
                  <div className="py-24 flex flex-col items-center justify-center space-y-6 text-center">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="text-indigo-500"
                    >
                      <Loader2 className="w-16 h-16" />
                    </motion.div>
                    <div>
                      <h4 className="text-xl font-bold mb-2">
                        {scanStep === 'ocr' ? "다중 정보 인식 중..." : "최적 경로 및 시뮬레이션 중..."}
                      </h4>
                      <p className="text-slate-400 max-w-[320px]">
                        {scanStep === 'ocr' 
                          ? "이미지 내의 모든 신청 정보와 대상물을 개별적으로 구분하여 데이터화하고 있습니다." 
                          : "근무 상황과 위치 기반 데이터를 활용하여 실시간 이동 동선을 최적화하고 있습니다."}
                      </p>
                    </div>
                  </div>
                )}

                {scanStep === 'result' && recommendation && (
                  <div className="animate-in">
                    {/* Map Visualization */}
                    <div className="bg-[#0b0c14] aspect-video relative border-b border-white/10 overflow-hidden">
                       <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:20px_20px]" />
                       
                       {/* Background building shadows */}
                       <div className="absolute inset-0 opacity-20 pointer-events-none">
                          {Object.keys(BUILDING_COORDS).map(name => {
                            const c = BUILDING_COORDS[name];
                            return <div key={name} className="absolute w-12 h-8 bg-slate-800/40 rounded-sm blur-md" style={{ left: `${c.x}%`, top: `${c.y}%`, transform: 'translate(-50%, -50%)' }} />;
                          })}
                       </div>

                       <svg className="absolute inset-0 w-full h-full">
                          <defs>
                            <marker id="arrow" viewBox="0 0 10 10" refX="25" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                              <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(99, 102, 241, 0.8)" />
                            </marker>
                            <filter id="glow">
                              <feGaussianBlur stdDeviation="2" result="blur" />
                              <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                          </defs>

                          {/* Path lines with arrows */}
                          {recommendation.route && recommendation.route.length > 1 && (
                            <>
                                <motion.polyline
                                    points={recommendation.route.map(b => {
                                        const c = BUILDING_COORDS[b];
                                        return c ? `${c.x}%,${c.y}%` : "";
                                    }).join(" ")}
                                    fill="none"
                                    stroke="rgba(99, 102, 241, 0.3)"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <motion.polyline
                                    points={recommendation.route.map(b => {
                                        const c = BUILDING_COORDS[b];
                                        return c ? `${c.x}%,${c.y}%` : "";
                                    }).join(" ")}
                                    fill="none"
                                    stroke="url(#pathGradient)"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    markerEnd="url(#arrow)"
                                    initial={{ pathLength: 0 }}
                                    animate={{ pathLength: 1 }}
                                    transition={{ duration: 1.5, ease: "easeInOut" }}
                                    style={{ filter: 'url(#glow)' }}
                                />
                                <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                            </>
                          )}

                          {/* Location Nodes */}
                          {Object.keys(BUILDING_COORDS).map(name => {
                            const routeIndex = recommendation.route?.indexOf(name) ?? -1;
                            const isActive = routeIndex !== -1;
                            const isCurrentTask = currentTasks.some(t => t.location?.startsWith(name));
                            
                            return (
                                <g key={name}>
                                    <MapNode 
                                        name={name} 
                                        isActive={isActive} 
                                    />
                                    {isActive && (
                                        <text 
                                            x={`${BUILDING_COORDS[name].x}%`} 
                                            y={`${BUILDING_COORDS[name].y - 18}%`} 
                                            textAnchor="middle" 
                                            className="fill-indigo-400 font-bold text-[8px]"
                                        >
                                            STEP {routeIndex + 1}
                                        </text>
                                    )}
                                </g>
                            );
                          })}
                       </svg>
                    </div>

                    <div className="p-8 space-y-8">
                       {/* Recommendation Headline */}
                       <div className={cn(
                            "p-5 rounded-3xl border flex items-center justify-between",
                            recommendation.shouldDispatch 
                                ? "bg-green-500/10 border-green-500/20" 
                                : "bg-orange-500/10 border-orange-500/20"
                        )}>
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "p-3 rounded-2xl",
                                    recommendation.shouldDispatch ? "bg-green-500" : "bg-orange-500"
                                )}>
                                    {recommendation.shouldDispatch ? <CheckCircle2 className="text-white w-6 h-6" /> : <Clock className="text-white w-6 h-6" />}
                                </div>
                                <div>
                                    <div className="font-bold text-lg">{recommendation.shouldDispatch ? "즉시 출동 분석 완료" : "업무 보류 권장"}</div>
                                    <p className="text-sm opacity-70 leading-tight">
                                        {recommendation.shouldDispatch ? "시스템이 생성한 최적 동선으로 출동을 시작하세요" : recommendation.reason}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Order Confirmation List (Combined) */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <PackageSearch className="w-4 h-4" />
                                    통합 업무 체크리스트 ({completedTaskIds.length}/{currentTasks.length + pendingTasks.length})
                                </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[...currentTasks, ...pendingTasks].map((task, idx) => {
                                    const isDone = completedTaskIds.includes(task.itemNumber || "");
                                    const isNew = idx < currentTasks.length;
                                    return (
                                        <div 
                                            key={idx} 
                                            onClick={() => toggleTaskCompletion(task.itemNumber || "")}
                                            className={cn(
                                                "p-4 rounded-2xl border transition-all cursor-pointer select-none relative group",
                                                isDone ? "bg-green-500/10 border-green-500/30 opacity-60" : "bg-white/5 border-white/10 hover:bg-white/10"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[9px] px-1.5 py-0.5 rounded border uppercase font-bold",
                                                        isNew ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                                    )}>
                                                        {isNew ? "NEW" : "PENDING"}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 font-mono">#{task.itemNumber}</span>
                                                </div>
                                                {isDone && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                            </div>
                                            <div className={cn(
                                                "font-bold mb-1 transition-all",
                                                isDone && "line-through text-slate-500"
                                            )}>
                                                {task.itemName}
                                            </div>
                                            <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                                <MapPin className="w-3 h-3" /> {task.location}
                                                <span className="mx-2 opacity-10">|</span>
                                                <Users className="w-3 h-3" /> {task.applicant}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={() => setIsScanning(false)}
                                className="flex-1 bg-white/10 hover:bg-white/20 p-5 rounded-3xl font-bold transition-all text-slate-400"
                            >
                                분석 창 닫기
                            </button>
                            <button
                                onClick={saveTasks}
                                className="flex-[1.5] premium-gradient p-5 rounded-3xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                            >
                                {completedTaskIds.length === (currentTasks.length + pendingTasks.length) 
                                    ? "모든 통합 업무 완료" 
                                    : (recommendation.shouldDispatch ? "통합 출동 시작 & 저장" : "미완료 건 통합 보류")}
                            </button>
                        </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
