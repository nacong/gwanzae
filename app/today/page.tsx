"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, MapPin, Truck } from "lucide-react";
import TabBar from "@/components/TabBar";
import { schedulesToday, dispatchConfirm, type Schedule, type RouteBuilding } from "@/lib/api";

/* ─── 그룹핑: 스케줄 행 → 시간슬롯 → 정류장(건물) → 카드(신청서) ─── */

interface Card {
  신청번호: string;
  신청일자: string;
  신청부서: string;
  itemSummary: string;
}
interface Stop {
  건물명: string;
  cards: Card[];
  동선: RouteBuilding | null;
}
interface Slot {
  key: string;
  출동일시: string;
  stops: Stop[];
  appNumbers: string[];
}

function buildingOf(s: Schedule): string {
  if (s.동선?.건물명) return s.동선.건물명;
  if (s.건물명) return s.건물명;
  if (s.설치장소) return s.설치장소.split(/[\s\d]/)[0] || s.설치장소;
  return s.신청부서 ?? "미지정";
}

function itemSummary(rows: Schedule[]): string {
  const first = rows[0]?.품명 ?? "품목";
  return rows.length > 1 ? `${first} 외 ${rows.length - 1}건` : first;
}

function groupSchedules(rows: Schedule[]): Slot[] {
  const bySlot = new Map<string, Schedule[]>();
  for (const r of rows) {
    const k = r.출동일시 ?? "미정";
    (bySlot.get(k) ?? bySlot.set(k, []).get(k)!).push(r);
  }
  const slots: Slot[] = [];
  for (const [출동일시, slotRows] of bySlot) {
    const byBuilding = new Map<string, Schedule[]>();
    for (const r of slotRows) {
      const b = buildingOf(r);
      (byBuilding.get(b) ?? byBuilding.set(b, []).get(b)!).push(r);
    }
    const stops: Stop[] = [];
    for (const [건물명, bRows] of byBuilding) {
      const byApp = new Map<string, Schedule[]>();
      for (const r of bRows) {
        const k = r.신청번호 ?? r.신청부서 ?? 건물명;
        (byApp.get(k) ?? byApp.set(k, []).get(k)!).push(r);
      }
      const cards: Card[] = [...byApp.values()].map((appRows) => ({
        신청번호: appRows[0].신청번호 ?? "-",
        신청일자: appRows[0].신청일자 ?? "",
        신청부서: appRows[0].신청부서 ?? "-",
        itemSummary: itemSummary(appRows),
      }));
      stops.push({ 건물명, cards, 동선: bRows.find((r) => r.동선)?.동선 ?? null });
    }
    const appNumbers = [...new Set(slotRows.map((r) => r.신청번호).filter((n): n is string => !!n))];
    slots.push({ key: 출동일시, 출동일시, stops, appNumbers });
  }
  return slots;
}

function slotLabel(iso: string): { title: string; range: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { title: iso, range: "" };
  const hour = d.getHours();
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const end = new Date(d.getTime() + 50 * 60000);
  const fmt = (x: Date) => {
    const hh = x.getHours();
    const a = hh < 12 ? "오전" : "오후";
    const h = hh % 12 === 0 ? 12 : hh % 12;
    return `${a} ${h}:${String(x.getMinutes()).padStart(2, "0")}`;
  };
  return { title: `${ampm} ${h12}시 출발 건`, range: `${fmt(d)} - ${fmt(end)}` };
}

/* ─── 카드 컴포넌트 ──────────────────────────────────────────── */

function AppCard({ card }: { card: Card }) {
  return (
    <div className="flex w-full flex-col gap-3.5 rounded-xl border border-[#e2e8f0] bg-white px-[18px] py-4">
      <div className="flex items-start justify-between text-[#1e293b]">
        <p className="text-sm">{card.신청번호}</p>
        <p className="text-xs">{card.신청일자}</p>
      </div>
      <div className="flex items-end gap-1.5 text-[#475569]">
        <p className="text-base font-bold">{card.신청부서}</p>
        <p className="truncate text-[13px]">{card.itemSummary}</p>
      </div>
    </div>
  );
}

function StopRow({ stop, isLast, isStart }: { stop: Stop; isLast: boolean; isStart: boolean }) {
  return (
    <div className="flex gap-4">
      <div className="flex w-6 flex-col items-center self-stretch">
        <div className="flex size-6 items-center justify-center rounded-xl border-2 border-[#5b86ff] bg-white">
          {isStart ? <Home size={12} className="text-[#5b86ff]" /> : <MapPin size={12} className="text-[#5b86ff]" />}
        </div>
        {!isLast && <div className="w-0.5 flex-1 rounded-[1px] bg-[#e2e8f0]" />}
      </div>
      <div className="flex w-[273px] flex-col items-start gap-3 pb-8">
        <p className="text-base font-bold text-[#1e293b]">{stop.건물명}</p>
        {stop.cards.map((c, i) => <AppCard key={i} card={c} />)}
      </div>
    </div>
  );
}

/* ─── 페이지 ─────────────────────────────────────────────────── */

export default function TodayPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await schedulesToday();
        setSlots(groupSchedules(Array.isArray(rows) ? rows : []));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDispatch() {
    const slot = slots[active];
    if (!slot) return;
    setDispatching(true);
    setError(null);
    try {
      const result = await dispatchConfirm();
      const matched = result.슬롯별?.find((s) => s.출동일시 === slot.출동일시) ?? result.슬롯별?.[0];
      const routeData = matched?.동선 ?? [];
      if (routeData.length === 0) {
        setError("이 출동 건에는 계산된 이동 경로가 없습니다. 신청서 화면에서 최적화를 먼저 실행해주세요.");
        setDispatching(false);
        return;
      }
      localStorage.setItem("gwanzae-dispatch-route", JSON.stringify(routeData));
      localStorage.setItem("gwanzae-dispatch-apps", JSON.stringify(slot.appNumbers));
      router.push("/dispatch");
    } catch (e) {
      setError(String(e));
      setDispatching(false);
    }
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col bg-[#f2f4f7] pb-[calc(161px+env(safe-area-inset-bottom))]">
      <header className="flex h-20 items-center justify-between px-5 pt-safe-top">
        <h1 className="text-2xl font-extrabold text-[#111827]">오늘 수거 일정</h1>
      </header>

      <main className="flex flex-1 flex-col items-center gap-4 p-5">
        {loading && <p className="mt-20 text-sm text-[#94a3b8]">일정을 불러오는 중…</p>}
        {error && (
          <div className="w-full rounded-xl bg-white p-4">
            <p className="mb-2 text-sm font-bold text-[#dc2626]">오류가 발생했어요</p>
            <pre className="whitespace-pre-wrap break-all text-xs text-[#64748b]">{error}</pre>
          </div>
        )}
        {!loading && !error && slots.length === 0 && (
          <p className="mt-20 text-sm text-[#94a3b8]">오늘 예정된 수거 일정이 없습니다.</p>
        )}

        {slots.length > 0 && (
          <>
            <div
              className="flex w-full snap-x snap-mandatory gap-4 overflow-x-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                setActive(Math.round(el.scrollLeft / el.clientWidth));
              }}
            >
              {slots.map((slot) => {
                const { title, range } = slotLabel(slot.출동일시);
                return (
                  <div key={slot.key} className="w-full shrink-0 snap-center">
                    <div className="flex max-h-[537px] w-full flex-col overflow-hidden rounded-2xl border-2 border-[#003dea] bg-white">
                      <div className="flex flex-col gap-3 border-b border-[#e2e8f0] px-6 py-5">
                        <p className="text-[22px] font-bold text-[#1e293b]">{title}</p>
                        <p className="text-base text-[#475569]">{range}</p>
                      </div>
                      <div className="flex flex-col overflow-y-auto px-6 py-5">
                        {slot.stops.map((stop, i) => (
                          <StopRow key={i} stop={stop} isStart={i === 0} isLast={i === slot.stops.length - 1} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {slots.length > 1 && (
              <div className="flex items-center justify-center gap-2">
                {slots.map((_, i) => (
                  <span
                    key={i}
                    className={`h-2 rounded-2xl transition-all ${i === active ? "w-4 bg-[#475569]" : "w-2 bg-[#cbd5e1]"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {slots.length > 0 && (
        <div
          className="fixed inset-x-0 z-30 bg-[#f2f4f7] px-5 pb-3 pt-2"
          style={{ bottom: "calc(81px + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={handleDispatch}
            disabled={dispatching}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#0043ff] px-6 py-4 text-lg font-semibold text-white disabled:opacity-60"
          >
            <Truck size={22} />
            {dispatching ? "출동 준비 중…" : "출동"}
          </button>
        </div>
      )}

      <TabBar />
    </div>
  );
}
