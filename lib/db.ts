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
