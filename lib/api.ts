// API 클라이언트 — openapi.yaml (X-API-Key 인증) 기준

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
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function handle<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
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

/* ─── 실내 수거 동선 (Navigation) ────────────────────────────────
   GET /schedules/{id}/navigation — 한 일정의 실내 수거 동선을
   층별 평면도 위 '픽셀 좌표'로 반환한다(서버가 미리 렌더 계산).
   - floors[].image_url : "/route_buildings/..." (assetUrl 로 절대화)
   - floors[].points    : 방문 순서대로의 노드 (픽셀 x/y, 수거/시작 여부)
   - floors[].path      : 같은 층 노드들을 이은 폴리라인 [[x, y], ...]
   동선 미계산·데이터 누락 시 상태(예: "동선없음")로 사유를 알린다.

   ⚠️ 응답 스키마가 openapi 에 typed 로 명세돼 있지 않고(schema: {}),
   현재 데모 데이터셋엔 도면이 있는 건물이 없어 populated 응답을 직접
   확인하지 못했다. points/floor 의 정확한 키 표기는 아래 normalize 로
   (한글·영문 변형 모두) 흡수하며, 실제 도면 건물 확인 시 조정하면 된다. */

export type NavPoint = {
  x: number;
  y: number;
} & Record<string, unknown>;

export type NavFloor = {
  image_url?: string | null;
  points?: NavPoint[];
  path?: [number, number][];
} & Record<string, unknown>;

export type NavigationResponse = {
  schedule_id: number;
  상태: string;
  detail?: string;
  건물명?: string;
  floors: NavFloor[];
} & Record<string, unknown>;

export async function scheduleNavigation(scheduleId: number): Promise<NavigationResponse> {
  const res = await fetch(`${API_BASE}/schedules/${scheduleId}/navigation`, { headers: headers(false) });
  return handle<NavigationResponse>(res, `GET /schedules/${scheduleId}/navigation`);
}
