// 품목명 → 필요 인원 수 Mock DB (localStorage 기반)
const DB_KEY = "gwanzae-personnel-db";

export type PersonnelDB = Record<string, number>;

function getDB(): PersonnelDB {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 품목명으로 필요 인원 조회. 없으면 null 반환 */
export function lookupPersonnel(itemName: string): number | null {
  if (!itemName) return null;
  const db = getDB();
  const val = db[itemName];
  return val !== undefined ? val : null;
}

/** 품목명 → 필요 인원 저장 */
export function savePersonnel(itemName: string, count: number): void {
  const db = getDB();
  db[itemName] = count;
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ─── Products API ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export type Product = {
  품명: string;
  필요인원수: number;
};

export type ProductUpdate = {
  품명?: string | null;
  필요인원수?: number | null;
};

export async function fetchProducts(skip = 0, limit = 100): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products?skip=${skip}&limit=${limit}`);
  if (!res.ok) throw new Error(`GET /products failed: ${res.status}`);
  return res.json();
}

/** 특정 품명의 필요 인원 정보 조회 */
export async function fetchWorkers(품명: string): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/products/workers?${new URLSearchParams({ 품명 })}`
  );
  if (!res.ok) throw new Error(`GET /products/workers failed: ${res.status}`);
  return res.json();
}

export async function createProduct(product: Product): Promise<unknown> {
  const res = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error(`POST /products failed: ${res.status}`);
  return res.json();
}

/** 품명(name)으로 제품 정보 업데이트 */
export async function updateProduct(
  name: string,
  update: ProductUpdate
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/products/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`PATCH /products/${name} failed: ${res.status}`);
  return res.json();
}

export async function importProductsFromS3(s3Key: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/products/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ s3_key: s3Key }),
  });
  if (!res.ok) throw new Error(`POST /products/import failed: ${res.status}`);
  return res.json();
}

// ─── Optimize API ─────────────────────────────────────────────────────────────

export type RouteItem = {
  품명: string;
  설치장소: string;
  수량: number;
  필요인원수: number;
};

export type RouteRequest = {
  투입인원수?: number | null;
  신청서: RouteItem[];
};

/** 투입인원수와 신청서 목록으로 최적 동선 계산 */
export async function optimizeRoute(req: RouteRequest): Promise<unknown> {
  const res = await fetch(`${API_BASE}/optimize/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`POST /optimize/route failed: ${res.status}`);
  return res.json();
}
