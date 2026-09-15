// API 클라이언트 — openapi.yaml (X-API-Key 인증) 기준

import { clearAuth, getStoredToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

/* ─── 진단 로그 ──────────────────────────────────────────────────
   요청이 실제로 어디로 나가는지 / 응답이 뭔지 콘솔에서 바로 확인.
   특히 배포 환경에서 NEXT_PUBLIC_API_BASE 누락 시 요청이 앱 자기
   자신(상대경로)으로 나가 404 HTML을 받는 상황을 드러낸다. */

// 앱 로드 시 1회: 현재 API 설정 상태를 찍는다 (키는 마스킹).
if (typeof window !== "undefined") {
  const maskedKey = API_KEY ? `${API_KEY.slice(0, 4)}…(${API_KEY.length}자)` : "(없음)";
  if (API_BASE) {
    console.info(`[api] API_BASE=${API_BASE} · API_KEY=${maskedKey}`);
  } else {
    console.error(
      "[api] NEXT_PUBLIC_API_BASE 가 비어 있습니다. 요청이 앱 자기 자신으로 나가 404(HTML)를 받게 됩니다. " +
        "배포 환경(Vercel 등)의 환경변수를 확인하세요.",
    );
  }
}

/** 서버가 정적 제공하는 리소스(도면 이미지 등)의 절대 URL을 만든다.
 *  navigation 응답의 image_url 은 "/route_buildings/..." 처럼 API 호스트 기준 경로다. */
export function assetUrl(path?: string | null): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function headers(json = true): HeadersInit {
  const h: Record<string, string> = { "X-API-Key": API_KEY };
  if (typeof window !== "undefined") {
    const token = getStoredToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function handle<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  const sessionUnauthorized = res.status === 401 && /로그인|인증이 만료/.test(text);
  if (sessionUnauthorized && typeof window !== "undefined") {
    clearAuth();
    if (window.location.pathname !== "/login") window.location.replace("/login");
  }
  // 실제로 요청이 나간 최종 URL(res.url)과 상태를 찍는다.
  if (res.ok) {
    console.info(`[api] ✓ ${label} → ${res.status} · ${res.url}`);
  } else {
    console.error(`[api] ✗ ${label} → ${res.status} · ${res.url}\n${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`${label} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/* ─── 도메인 타입 (openapi 스키마 기준) ─────────────────────── */

export type ApplicationItem = {
  자산번호?: string;
  품명: string;
  규격모델?: string;
  설치장소?: string;
  수량?: number;
  금액?: string;
  필요인원수: number;
};

export type Application = {
  id: number;
  신청번호: string;
  신청일자: string;
  신청부서: string;
  신청자?: string;
  연락처?: string;
  물품목록: ApplicationItem[];
  점검완료?: boolean;
  상태?: string;
  출동일시?: string | null;
};

export type ApplicationPatch = Partial<{
  신청번호: string;
  신청일자: string;
  신청부서: string;
  신청자: string;
  연락처: string;
  물품목록: ApplicationItem[];
  점검완료: boolean;
}>;

// 동선 — 서버가 미리 계산해 스케줄에 심어둔 건물 내 수거 경로 (기존 /optimize/route 응답과 동일 구조)

export type RoutePickupItem = {
  호수: string;
  품명: string;
  수량: number;
} & Record<string, unknown>;

export type RouteNode = {
  id: string;
  x: number;
  y: number;
  floor: string;
  node_type: string;
  is_start: boolean;
  is_pickup: boolean;
  is_elevator: boolean;
  is_stair: boolean;
  assigned_rooms: string[];
  pickup_items: RoutePickupItem[];
};

export type RouteEdge = {
  order: number;
  from: string;
  to: string;
  from_floor: string;
  to_floor: string;
  edge_type: string;
  is_floor_transition: boolean;
};

export type RouteStep = {
  step_no: number;
  step_type: string;
  guide_text: string;
  floor: string;
  node_sequence: string[];
  nodes: RouteNode[];
  edges: RouteEdge[];
  trigger_node: string;
  is_last_step: boolean;
};

export type RouteBuilding = {
  건물명: string;
  상태: string;
  steps: RouteStep[];
} & Record<string, unknown>;

export type Schedule = {
  id: number;
  출동일시: string;
  자산번호?: string;
  품명?: string;
  규격모델?: string;
  금액?: string;
  설치장소?: string;
  신청부서?: string;
  신청번호?: string;
  신청일자?: string;
  수량?: number;
  필요인원수?: number;
  투입인원수?: number;
  가용명단?: string;
  배정인원?: string[];
  배정확정?: boolean;
  출동확정?: boolean;
  동선?: RouteBuilding | null;
  건물명?: string;
  optimize_run_id?: number | string | null;
};

/* ─── 신청서 (Applications) ──────────────────────────────────── */

export async function listApplications(상태?: string): Promise<Application[]> {
  const qs = 상태 ? `?${new URLSearchParams({ 상태 })}` : "";
  const res = await fetch(`${API_BASE}/applications${qs}`, { headers: headers(false) });
  return handle<Application[]>(res, "GET /applications");
}

export async function getApplication(appId: number): Promise<Application> {
  const res = await fetch(`${API_BASE}/applications/${appId}`, { headers: headers(false) });
  return handle<Application>(res, `GET /applications/${appId}`);
}

export async function updateApplication(appId: number, patch: ApplicationPatch): Promise<Application> {
  const res = await fetch(`${API_BASE}/applications/${appId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  return handle<Application>(res, `PATCH /applications/${appId}`);
}

// products 마스터 — 품명별 기본 필요인원수 (신청서 생성 시 이 값으로 채워진다)
export type Product = {
  품명: string;
  필요인원수: number;
};

export async function listProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products?limit=1000`, { headers: headers(false) });
  return handle<Product[]>(res, "GET /products");
}

export async function completeApplication(appId: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/applications/${appId}/complete`, {
    method: "PATCH",
    headers: headers(false),
  });
  return handle<unknown>(res, `PATCH /applications/${appId}/complete`);
}

export async function createApplicationFromOcr(
  files: File | readonly File[],
  meta: Partial<{ 신청번호: string; 신청일자: string; 신청부서: string; 신청자: string; 연락처: string }> = {},
): Promise<Application> {
  const uploads: readonly File[] = Array.isArray(files) ? files : [files as File];
  if (uploads.length === 0) throw new Error("OCR로 인식할 신청서 이미지가 없습니다.");

  const form = new FormData();
  uploads.forEach((file) => form.append("file", file, file.name));
  Object.entries(meta).forEach(([k, v]) => { if (v) form.append(k, v); });
  const res = await fetch(`${API_BASE}/ocr/applications`, {
    method: "POST",
    headers: headers(false),
    body: form,
  });
  return handle<Application>(res, "POST /ocr/applications");
}

/* ─── 일정 / 최적화 / 출동 ───────────────────────────────────── */

export async function optimizeRun(): Promise<unknown> {
  const res = await fetch(`${API_BASE}/optimize/run`, { method: "POST", headers: headers(false) });
  return handle<unknown>(res, "POST /optimize/run");
}

export async function schedulesToday(): Promise<Schedule[]> {
  const res = await fetch(`${API_BASE}/schedules/today`, { headers: headers(false) });
  return handle<Schedule[]>(res, "GET /schedules/today");
}

export type DispatchConfirmSlot = {
  출동일시: string;
  일정수: number;
  건물수: number;
  동선: RouteBuilding[];
};

export type DispatchConfirmResult = {
  확정_일정수: number;
  출동_슬롯수: number;
  슬롯별: DispatchConfirmSlot[];
};

export async function dispatchConfirm(투입인원수?: number, 출동일시?: string): Promise<DispatchConfirmResult> {
  const params = new URLSearchParams();
  if (투입인원수 != null) params.set("투입인원수", String(투입인원수));
  if (출동일시) params.set("출동일시", 출동일시);
  const qs = params.size > 0 ? `?${params}` : "";
  const res = await fetch(`${API_BASE}/dispatch/confirm${qs}`, { method: "POST", headers: headers(false) });
  return handle<DispatchConfirmResult>(res, "POST /dispatch/confirm");
}

export type SchedulePatch = Partial<Omit<Schedule, "id">>;

export async function updateSchedule(scheduleId: number, patch: SchedulePatch): Promise<unknown> {
  const res = await fetch(`${API_BASE}/schedules/${scheduleId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  return handle<unknown>(res, `PATCH /schedules/${scheduleId}`);
}

/* ─── 작업시간 / Borg / 관리자 추천 ─────────────────────────── */

export type WorkSessionCreate = {
  client_session_id: string;
  worker_name: string;
  schedule_ids: number[];
  application_numbers: string[];
  started_at: string;
  completed_at: string;
  total_seconds: number;
  work_seconds: number | null;
  driving_seconds: number;
  unknown_seconds: number;
  gps_sample_count: number;
  gps_rejected_count: number;
  tracking_quality: "unavailable" | "poor" | "estimated";
  borg_cr10: number | null;
  team_size?: number;
};

export type WorkSession = WorkSessionCreate & {
  id: number;
  user_id: number | null;
  borg_source: "user" | "predicted" | null;
  predicted_borg_cr10: number | null;
  prediction_confidence: "insufficient" | "low" | "medium" | "high" | null;
  prediction_model_version: string | null;
  prediction_validation_mae: number | null;
};

export type FatiguePredictionInput = Pick<
  WorkSessionCreate,
  "schedule_ids" | "total_seconds" | "work_seconds" | "driving_seconds" | "unknown_seconds" | "team_size"
>;

export type FatiguePrediction = {
  predicted_borg_cr10: number | null;
  prediction_confidence: "insufficient" | "low" | "medium" | "high";
  prediction_source: "personal_actual" | "stored_initial" | "insufficient";
  actual_response_count: number;
  validation_count: number;
  validation_mae: number | null;
  model_ready: boolean;
  survey_required: boolean;
};

export async function predictFatigueAfterWork(body: FatiguePredictionInput): Promise<FatiguePrediction> {
  const res = await fetch(`${API_BASE}/fatigue/predict`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handle<FatiguePrediction>(res, "POST /fatigue/predict");
}

export type FatigueDatasetTrainingResult = {
  status: "trained";
  filename: string;
  row_count: number;
  global_model_id: number;
  global_sample_count: number;
  personal_model_count: number;
  personal_models: Array<{
    worker_name: string;
    sample_count: number;
    linked_user_id: number | null;
  }>;
  skipped_personal_models: Array<{
    worker_name: string;
    sample_count: number;
    reason: string;
  }>;
  model_version: string;
  recognized_columns: string[];
  ignored_columns: string[];
};

export async function trainFatigueDataset(file: File): Promise<FatigueDatasetTrainingResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/fatigue/train-dataset`, {
    method: "POST",
    headers: headers(false),
    body: form,
  });
  return handle<FatigueDatasetTrainingResult>(res, "POST /fatigue/train-dataset");
}

export async function createWorkSession(body: WorkSessionCreate): Promise<WorkSession> {
  const res = await fetch(`${API_BASE}/work-sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handle<WorkSession>(res, "POST /work-sessions");
}

export type WorkerTodayStatus = {
  user_id: number | null;
  worker_name: string;
  membership_status: "joined" | "roster_only";
  session_count: number;
  borg_response_count: number;
  total_work_seconds: number;
  measured_work_session_count: number;
  daily_load: number;
  latest_borg_cr10: number | null;
  latest_borg_source: "user" | "predicted" | null;
  latest_actual_borg_cr10: number | null;
  latest_predicted_borg_cr10: number | null;
  prediction_confidence: "insufficient" | "low" | "medium" | "high";
  model_ready: boolean;
  survey_required: boolean;
  actual_response_count: number;
  validation_mae: number | null;
  latest_completed_at: string | null;
  state_borg_cr10: number | null;
  state_source: "actual_today" | "predicted_today" | "last_actual" | "last_predicted" | "test_seed" | "model_baseline" | "unmeasured";
  state_scope: "today" | "last_known" | "initial" | "unmeasured";
  state_updated_at: string | null;
  model_source: "test_seed" | "operational" | "dataset_import" | null;
};

export async function workersStatusToday(): Promise<WorkerTodayStatus[]> {
  const res = await fetch(`${API_BASE}/workers/status/today`, { headers: headers(false) });
  return handle<WorkerTodayStatus[]>(res, "GET /workers/status/today");
}

export type StaffingWorkerDetail = {
  worker_name: string;
  recommended: boolean;
  reason: string;
};

export type StaffingProposal = {
  dispatch_time: string;
  schedule_ids: number[];
  application_numbers: string[];
  team_size: number;
  required_team_size: number;
  available_workers: string[];
  recommended_workers: string[];
  worker_details: StaffingWorkerDetail[];
  confirmed_workers: string[];
  basis: string;
};

export async function staffingRecommendationsToday(): Promise<StaffingProposal[]> {
  const res = await fetch(`${API_BASE}/staffing/recommendations/today`, { headers: headers(false) });
  return handle<StaffingProposal[]>(res, "GET /staffing/recommendations/today");
}

export async function confirmStaffingRecommendation(
  proposal: StaffingProposal,
  selectedWorkers: string[] = proposal.recommended_workers,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/staffing/recommendations/confirm`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      dispatch_time: proposal.dispatch_time,
      schedule_ids: proposal.schedule_ids,
      selected_workers: selectedWorkers,
    }),
  });
  return handle<unknown>(res, "POST /staffing/recommendations/confirm");
}

export type NavigationProgress = {
  dispatch_time: string;
  phase: "overview" | "nav" | "completed";
  active_schedule_id: number | null;
  step_index: number;
  revision: number;
  updated_at: string | null;
  controller_user_id: number | null;
};

export async function getNavigationProgress(dispatchTime: string): Promise<NavigationProgress> {
  const query = new URLSearchParams({ dispatch_time: dispatchTime });
  const res = await fetch(`${API_BASE}/navigation/progress?${query}`, { headers: headers(false) });
  return handle<NavigationProgress>(res, "GET /navigation/progress");
}

export async function updateNavigationProgress(body: {
  dispatch_time: string;
  phase: "overview" | "nav" | "completed";
  active_schedule_id: number;
  step_index: number;
}): Promise<NavigationProgress> {
  const res = await fetch(`${API_BASE}/navigation/progress`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return handle<NavigationProgress>(res, "PUT /navigation/progress");
}

/* ─── 실내 수거 동선 (Navigation) ────────────────────────────────
   GET /schedules/{id}/navigation — 한 일정의 실내 수거 동선을
   '스텝 단위'로 반환한다(스텝당 층 이미지 1장). 각 스텝 = 하단 패널 한 장:
   - guide_text / type_label / floor_label : 서버가 완성한 표시 문자열
   - floor.image_url  : "/route_buildings/..." (assetUrl 로 절대화, 정적 제공)
   - floor.path       : 도면 픽셀 좌표 점 배열 [{x, y}, ...] (그리는 순서)
   - floor.nodes      : 찍을 노드 (픽셀 x/y, role/kind/label/pickup_items)
   - floor.route_bbox : 오토센터링용 bbox
   floor_mapping 이 없는 건물/층은 floor=null(텍스트 스텝)로 내려온다.

   ⚠️ 응답 스키마가 openapi 에 typed 로 명세돼 있지 않아(schema: {}),
   세부 키는 아래 소비부(app/dispatch)에서 (한글·영문 변형 모두) 흡수한다. */

export type NavPickupItem = {
  호수?: string;
  품명?: string;
  수량?: number;
} & Record<string, unknown>;

export type NavNode = {
  x: number;
  y: number;
  role?: string;                 // 예: start / pickup / waypoint
  kind?: string;                 // 예: room / elevator / stair
  label?: string;                // 호수·명칭 등 표시 문자열
  pickup_items?: NavPickupItem[];
} & Record<string, unknown>;

// route_bbox — 서버가 {x,y,width,height} 또는 [x0,y0,x1,y1] 로 줄 수 있어 둘 다 흡수
export type NavBBox = ({
  x?: number;
  y?: number;
  width?: number;
  height?: number;
} & Record<string, unknown>) | number[];

export type NavFloor = {
  image_url?: string | null;
  path?: { x: number; y: number }[];
  nodes?: NavNode[];
  route_bbox?: NavBBox | null;
} & Record<string, unknown>;

export type NavStep = {
  guide_text?: string;      // 완성된 안내 문자열
  type_label?: string;      // 이동 / 수거 등
  floor_label?: string;     // 완성된 층 문자열
  floor?: NavFloor | null;  // floor_mapping 없으면 null (텍스트 스텝)
} & Record<string, unknown>;

export type NavigationResponse = {
  schedule_id: number;
  상태: string;
  detail?: string;
  건물명?: string;
  steps: NavStep[];
} & Record<string, unknown>;

export async function scheduleNavigation(scheduleId: number): Promise<NavigationResponse> {
  const res = await fetch(`${API_BASE}/schedules/${scheduleId}/navigation`, { headers: headers(false) });
  return handle<NavigationResponse>(res, `GET /schedules/${scheduleId}/navigation`);
}
