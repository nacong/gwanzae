// API 클라이언트 — openapi.yaml (X-API-Key 인증) 기준

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? "";

function headers(json = true): HeadersInit {
  const h: Record<string, string> = { "X-API-Key": API_KEY };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function handle<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
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

export async function completeApplication(appId: number): Promise<unknown> {
  const res = await fetch(`${API_BASE}/applications/${appId}/complete`, {
    method: "PATCH",
    headers: headers(false),
  });
  return handle<unknown>(res, `PATCH /applications/${appId}/complete`);
}

export async function createApplicationFromOcr(
  file: File,
  meta: Partial<{ 신청번호: string; 신청일자: string; 신청부서: string; 신청자: string; 연락처: string }> = {},
): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  Object.entries(meta).forEach(([k, v]) => { if (v) form.append(k, v); });
  const res = await fetch(`${API_BASE}/ocr/applications`, {
    method: "POST",
    headers: { "X-API-Key": API_KEY },
    body: form,
  });
  return handle<unknown>(res, "POST /ocr/applications");
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

export async function dispatchConfirm(투입인원수?: number): Promise<DispatchConfirmResult> {
  const qs = 투입인원수 != null ? `?${new URLSearchParams({ 투입인원수: String(투입인원수) })}` : "";
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
