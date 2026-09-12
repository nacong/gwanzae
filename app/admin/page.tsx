"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera, Users, Clock, CheckCircle2, X, Loader2,
  FileText, ScanLine, Truck, MapPin, AlertCircle, Navigation,
  Timer, ChevronRight, Package, ArrowRight, RefreshCw, Activity, Sparkles, LogOut, Upload,
} from "lucide-react";
import {
  cn, DispatchApplication, DispatchTimeGroup,
  getCurrentStaffStatus, getCurrentStaffNames, StaffStatus,
} from "@/lib/utils";
import {
  confirmStaffingRecommendation, createApplicationFromOcr, dispatchConfirm, schedulesToday,
  optimizeRun, staffingRecommendationsToday, trainFatigueDataset, workersStatusToday,
  updateApplication,
  type Application, type FatigueDatasetTrainingResult, type Schedule, type StaffingProposal, type WorkerTodayStatus,
} from "@/lib/api";
import { clearAuth, getStoredAuthUser } from "@/lib/auth";
import TabBar from "@/components/TabBar";

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

type AdminTodaySlot = {
  dispatchTime: string;
  rows: Schedule[];
  assignedWorkers: string[];
  requiredPersonnel: number;
  routeReady: boolean;
};

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
    (async () => {
      try {
        setWorkerStatuses(await workersStatusToday());
      } catch (statusError) {
        console.warn("[admin] 작업자 상태 조회 실패", statusError);
      } finally {
        setWorkerStatusLoading(false);
      }
    })();
  }, []);

  const refreshTodaySchedules = async () => {
    try {
      setTodaySchedulesError(null);
      setTodaySchedules(await schedulesToday());
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
      await optimizeRun();
      await refreshTodaySchedules();
      // 재최적화는 schedule ID를 새로 만들므로 이전 출동 계획은 더 이상 유효하지 않다.
      sessionStorage.removeItem("gwanzae-dispatch-plan");
      sessionStorage.removeItem("gwanzae-dispatch-apps");
      sessionStorage.removeItem("gwanzae-dispatch-started-at");
      sessionStorage.removeItem("gwanzae-dispatch-session-id");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[optimize/run API error]", err);
      setTodaySchedulesError(`일정 최적화 실패: ${message}`);
      setIsOptimizing(false);
      return;
    }

    // 2) 신청일자 기준 그룹핑
    const dateMap = new Map<string, DispatchApplication[]>();
    for (const app of unoptimizedApps) {
      const key = normalizeDate(app.신청일자);
      if (!dateMap.has(key)) dateMap.set(key, []);
      dateMap.get(key)!.push(app);
    }

    // 3) /optimize/run이 서버 일정을 이미 생성했다. 이 로컬 그룹은 화면 표시용이며,
    // 실제 실내 동선은 출동 확정 시 /dispatch/confirm에서 계산한다.
    const newGroups: DispatchTimeGroup[] = Array.from(dateMap.entries()).map(([date, apps]) => {
      const optimizedRoute = Array.from(new Set(
        apps.flatMap(a => a.물품목록.map(i => i.설치장소.split(" ")[0]))
      ));
      const now = new Date();
      const timeStr = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      return {
        id: Math.random().toString(36).substr(2, 9),
        scheduledDateTime: `${date} ${timeStr}`,
        applications: apps,
        isDispatched: false,
        optimizedRoute,
      };
    });

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

  // 서버 프리렌더 시각대와 브라우저 시각대 차이로 생기는 hydration 불일치를 피한다.
  const currentWorkerNames = mounted ? getCurrentStaffNames() : [];
  const authUser = mounted ? getStoredAuthUser() : null;
  // 서버가 조직 내 작업자만 반환하므로 관리자 이름이 고정 시간표에 있어도 섞이지 않는다.
  const visibleWorkerNames = workerStatuses.map((status) => status.worker_name);
  const statusByWorker = new Map(workerStatuses.map((status) => [status.worker_name, status]));
  const serverTodaySlots = useMemo(() => groupAdminSchedules(todaySchedules), [todaySchedules]);

  const openAdminDispatch = async (slot: AdminTodaySlot) => {
    if (slot.assignedWorkers.length === 0) {
      setStaffingMessage("먼저 해당 출동의 작업자를 배정해 주세요.");
      document.getElementById("admin-staffing")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const proposals = await staffingRecommendationsToday();
      setStaffingProposals(proposals);
      setStaffingSelections(Object.fromEntries(
        proposals.map((proposal) => [proposal.dispatch_time, proposal.recommended_workers]),
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
      await dispatchConfirm(selected.length, proposal.dispatch_time);
      setStaffingProposals((current) => current?.map((item) => (
        item.dispatch_time === proposal.dispatch_time ? { ...item, confirmed_workers: selected } : item
      )) ?? null);
      await refreshTodaySchedules();
      setStaffingMessage("인원 배정과 출동 동선을 확정했습니다. 배정된 작업자의 오늘 화면에 일정이 표시됩니다.");
    } catch (confirmError) {
      setStaffingMessage(`확정하지 못했습니다: ${String(confirmError)}`);
    } finally {
      setConfirmingProposal(null);
    }
  };

  return (
    <main className="app-screen font-pretendard flex-1 overflow-x-hidden px-4 pb-44 pt-safe-top">

      {/* ── 헤더 ── */}
      <header className="pt-6 pb-6">
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
      <section className="surface-card mb-7 p-4">
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
          {serverTodaySlots.map((slot) => {
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
          {!todaySchedulesLoading && serverTodaySlots.length === 0 && (
            <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">오늘 등록된 수거 일정이 없습니다.</p>
          )}
          {todaySchedulesLoading && serverTodaySlots.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> 일정을 불러오는 중입니다.
            </div>
          )}
        </div>
      </section>

      {/* 실제 작업 기록 기반 상태와 관리자 확정형 인원 추천 */}
      <section className="mb-7 space-y-4">
        <div className="surface-card rounded-2xl p-4 text-[#1f2937]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#0043ff]" />
                <h2 className="text-sm font-bold">작업자 상태</h2>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#4b5563]">
                작업 전에는 테스트 초기값 또는 최근 상태를, 출동 후에는 오늘의 실제·예측값을 보여줍니다.
              </p>
            </div>
            {workerStatusLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-[#f3f4f6] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-[#1f2937]">사전 데이터로 개인 모델 학습</p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                CSV·JSON·XLSX 파일을 올리면 공통 모델과 작업자별 모델을 즉시 갱신합니다.
              </p>
            </div>
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
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-[#0043ff] disabled:opacity-50"
            >
              {fatigueDatasetTraining
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />}
              {fatigueDatasetTraining ? "학습 중" : "데이터셋 선택"}
            </button>
          </div>
          {fatigueDatasetResult && (
            <p className="mt-2 rounded-lg bg-emerald-400/15 px-3 py-2 text-[10px] text-emerald-200">
              {fatigueDatasetResult.row_count}행 학습 완료 · 개인 모델 {fatigueDatasetResult.personal_model_count}명
              {fatigueDatasetResult.skipped_personal_models.length > 0
                ? ` · 데이터 부족 등으로 ${fatigueDatasetResult.skipped_personal_models.length}명 제외`
                : ""}
            </p>
          )}
          {fatigueDatasetError && (
            <p className="mt-2 rounded-lg bg-red-400/15 px-3 py-2 text-[10px] text-red-200">
              학습 실패: {fatigueDatasetError}
            </p>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleWorkerNames.map((name) => {
              const status = statusByWorker.get(name);
              const isCurrent = currentWorkerNames.includes(name);
              const effectiveBorg = status?.state_borg_cr10 ?? null;
              const sourceLabel = !status ? "확인 중"
                : status.state_source === "actual_today" ? "오늘 실제 응답"
                  : status.state_source === "predicted_today" ? "오늘 모델 예측"
                    : status.state_source === "last_actual" ? "최근 실제 응답"
                      : status.state_source === "last_predicted" ? "최근 모델 예측"
                        : status.state_source === "test_seed" ? "테스트 초기값"
                          : status.state_source === "model_baseline" ? "모델 초기값"
                            : "측정 전";
              const condition = effectiveBorg == null
                ? { label: "데이터 없음", color: "bg-white/10 text-slate-300" }
                : effectiveBorg >= 7
                  ? { label: "위험", color: "bg-red-100 text-red-600" }
                  : effectiveBorg >= 4
                    ? { label: "주의", color: "bg-amber-100 text-amber-700" }
                    : { label: "양호", color: "bg-emerald-100 text-emerald-600" };
              return (
                <div key={name} className="rounded-xl border border-[#e5e7eb] bg-white p-3 shadow-[0_4px_8px_rgba(31,41,55,0.03)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">{name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${condition.color}`}>
                      {condition.label}{isCurrent ? " · 가용" : ""}
                    </span>
                  </div>
                  {status ? (
                    <>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                        <div><p className="text-[10px] text-slate-400">작업</p><p className="mt-0.5 text-xs font-bold">{Math.round(status.total_work_seconds / 60)}분</p></div>
                        <div><p className="text-[10px] text-slate-400">실제 Borg</p><p className="mt-0.5 text-xs font-bold">{status.latest_actual_borg_cr10 ?? "-"}</p></div>
                        <div><p className="text-[10px] text-slate-400">상태 참고값</p><p className="mt-0.5 text-xs font-bold">{status.state_borg_cr10 ?? "-"}</p></div>
                        <div><p className="text-[10px] text-slate-400">누적부하</p><p className="mt-0.5 text-xs font-bold">{status.daily_load}</p></div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="rounded-full bg-white/10 px-2 py-1 text-slate-200">{sourceLabel}</span>
                        {status.membership_status === "roster_only" && (
                          <span className="rounded-full bg-sky-400/15 px-2 py-1 text-sky-200">계정 가입 전</span>
                        )}
                      </div>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {status.model_ready
                          ? `개인 모델 활성 · 최근 검증 MAE ${status.validation_mae ?? "-"}`
                          : `개인 모델 학습 중 · 실제 응답 ${status.actual_response_count}/8`}
                        {status.state_scope === "initial" ? " · 실제 작업 후 갱신" : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-[11px] text-slate-400">오늘 완료된 작업 데이터가 없습니다.</p>
                  )}
                </div>
              );
            })}
            {!workerStatusLoading && visibleWorkerNames.length === 0 && (
              <p className="text-xs text-slate-400">조직에 등록된 작업자와 인원표가 없습니다.</p>
            )}
          </div>
          <p className="mt-3 text-[10px] text-slate-400">
            테스트 초기값은 화면과 배정 흐름을 확인하기 위한 참고값이며 실제 응답으로 계산하지 않습니다. 누적부하는 당일 실제 작업만 반영합니다.
          </p>
        </div>

        <div id="admin-staffing" className="surface-card scroll-mt-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-900">다음 출동 인원 참고안</h2>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                미리보기는 일정을 바꾸지 않습니다. 관리자가 인원을 검토하고 확정해야 기록됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={loadStaffingPreview}
              disabled={staffingLoading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0043ff] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
            >
              {staffingLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              추천안 보기
            </button>
          </div>

          {staffingProposals && (
            <div className="mt-4 space-y-3">
              {staffingProposals.map((proposal) => {
                const selected = staffingSelections[proposal.dispatch_time] ?? proposal.recommended_workers;
                const selectionValid = selected.length === proposal.team_size;
                return (
                  <div key={proposal.dispatch_time} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {new Date(proposal.dispatch_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 출동
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          필요 {proposal.required_team_size}명 · 선택 {proposal.team_size}명 · 신청 {proposal.application_numbers.length}건
                        </p>
                        {proposal.required_team_size > proposal.team_size && (
                          <p className="mt-1 text-[10px] font-bold text-amber-600">가용 인원이 {proposal.required_team_size - proposal.team_size}명 부족합니다.</p>
                        )}
                      </div>
                      {proposal.confirmed_workers.length > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">관리자 확정</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proposal.worker_details.map((worker) => {
                        const checked = selected.includes(worker.worker_name);
                        return (
                          <button
                            key={worker.worker_name}
                            type="button"
                            onClick={() => toggleStaffingWorker(proposal, worker.worker_name)}
                            className={`rounded-xl border px-3 py-2 text-left ${checked ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"}`}
                          >
                            <p className={`text-xs font-bold ${checked ? "text-indigo-700" : "text-slate-700"}`}>{worker.worker_name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{worker.reason}</p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className={`text-[10px] ${selectionValid ? "text-slate-500" : "font-bold text-amber-600"}`}>
                        {selected.length}/{proposal.team_size}명 선택
                      </p>
                      <button
                        type="button"
                        disabled={!selectionValid || confirmingProposal === proposal.dispatch_time}
                        onClick={() => confirmStaffing(proposal)}
                        className="rounded-xl bg-slate-900 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"
                      >
                        {confirmingProposal === proposal.dispatch_time ? "확정 중…" : "선택 인원 확정"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {staffingProposals.length === 0 && (
                <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">오늘 남은 출동 일정이 없습니다.</p>
              )}
            </div>
          )}
          {staffingMessage && <p className="mt-3 text-[11px] leading-relaxed text-slate-600">{staffingMessage}</p>}
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
