"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ArrowLeft, Phone, MoreVertical, Camera, X, ImageIcon, Upload, PartyPopper, Home, MapPin } from "lucide-react";
import {
  listApplications, completeApplication, scheduleNavigation, assetUrl,
  type NavFloor, type NavigationResponse,
} from "@/lib/api";

/* ─── 데이터 모델 ─────────────────────────────────────────────
   /today 에서 넘겨준 출동 계획(정류장/신청서 카드 + 대표 일정 id)을 읽어,
   1) '작업 목록' 오버뷰(전체 경로)를 먼저 보여주고,
   2) [길안내] 시 일정별 GET /schedules/{id}/navigation 으로 층별 도면 동선을
      받아 [이동 → 수거(사진)] walk-through 로 펼친다.                */

interface DispatchItem { 품명: string; 수량: number; 설치장소: string; }
interface DispatchCard { 신청번호: string; 신청일자: string; 신청부서: string; itemSummary: string; }
interface DispatchStop {
  건물명: string;
  kind: "warehouse" | "building";
  cards: DispatchCard[];
  scheduleId?: number;
  items?: DispatchItem[];
}
interface DispatchPlan { 출동일시: string; stops: DispatchStop[]; }
interface DispatchBuilding { 건물명: string; scheduleId: number; items: DispatchItem[]; }

const CSS_ANIM = `@keyframes dispatchDraw { to { stroke-dashoffset: 0; } }`;

/* ─── navigation 응답 정규화 (한글·영문 키 변형 흡수) ─────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(o: any, keys: string[]): unknown {
  for (const k of keys) if (o != null && o[k] != null) return o[k];
  return undefined;
}
function toNum(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : undefined;
}
function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === "true" || v === "Y" || v === "y";
}
function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

interface NavPt { x: number; y: number; pickup: boolean; start: boolean; room: string; }

function navPoints(floor: NavFloor): NavPt[] {
  const arr = Array.isArray(floor.points) ? floor.points : [];
  return arr.map((p) => ({
    x: toNum(pick(p, ["x", "px", "cx", "좌표x"])) ?? 0,
    y: toNum(pick(p, ["y", "py", "cy", "좌표y"])) ?? 0,
    pickup: toBool(pick(p, ["수거", "수거여부", "is_pickup", "pickup", "isPickup"])),
    start: toBool(pick(p, ["시작", "시작여부", "is_start", "start", "isStart"])),
    room: toStr(pick(p, ["호수", "room", "설치장소", "label", "name", "방"])),
  }));
}

function floorLabelOf(floor: NavFloor, idx: number): string {
  const raw = toStr(pick(floor, ["floor", "층", "name", "label", "floor_name"]));
  if (!raw) return `${idx + 1}층`;
  return raw.replace(/(\d+)\s*F/i, "$1층");
}

/* ─── 경로 후처리 (폴리라인 단순화 + 라운드) ─────────────────── */

type Pt = { x: number; y: number };

function ptToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function simplifyRoute(pts: Pt[], tol = 6): Pt[] {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptToLine(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) {
    const l = simplifyRoute(pts.slice(0, idx + 1), tol);
    const r = simplifyRoute(pts.slice(idx), tol);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
function makeRoundedPath(pts: Pt[], radius = 16): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], curr = pts[i], next = pts[i + 1];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
    if (l1 === 0 || l2 === 0) continue;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const p1 = { x: curr.x + (v1.x / l1) * r, y: curr.y + (v1.y / l1) * r };
    const p2 = { x: curr.x + (v2.x / l2) * r, y: curr.y + (v2.y / l2) * r };
    d.push(`L ${p1.x} ${p1.y}`, `Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`);
  }
  d.push(`L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`);
  return d.join(" ");
}

/** floor.path([[x,y]...]) 우선, 없으면 points 순서로 폴리라인 생성 */
function buildFloorPath(floor: NavFloor): string {
  const raw: Pt[] = [];
  const path = floor.path;
  if (Array.isArray(path) && path.length) {
    for (const seg of path) {
      if (Array.isArray(seg) && seg.length >= 2) {
        const x = toNum(seg[0]), y = toNum(seg[1]);
        if (x != null && y != null) raw.push({ x, y });
      }
    }
  } else {
    for (const p of navPoints(floor)) raw.push({ x: p.x, y: p.y });
  }
  if (raw.length < 2) return "";
  return makeRoundedPath(simplifyRoute(raw, 6), 16);
}

function viewBoxFor(pts: NavPt[], pad = 120): string {
  if (!pts.length) return "0 0 1448 1086";
  const xs = pts.map((n) => n.x), ys = pts.map((n) => n.y);
  const x1 = Math.min(...xs) - pad, y1 = Math.min(...ys) - pad;
  const x2 = Math.max(...xs) + pad, y2 = Math.max(...ys) + pad;
  return `${x1} ${y1} ${x2 - x1} ${y2 - y1}`;
}

/* ─── AnimatedPath ───────────────────────────────────────── */

const INIT_DUR = 2000;
const LOOP_DUR = 3800;
const MAP_COLOR = "#1976D2";
const START_COLOR = "#E53935";

function AnimatedPath({ d, color = MAP_COLOR, width = 12, animKey }: {
  d: string; color?: string; width?: number; animKey: number;
}) {
  const haloRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const line = lineRef.current, halo = haloRef.current, arrow = arrowRef.current;
    if (!line || !halo || !arrow || !d) return;

    const len = line.getTotalLength();
    [line, halo].forEach((el) => {
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      el.style.animation = "none";
    });
    void line.getBoundingClientRect();
    [line, halo].forEach((el) => {
      el.style.animation = `dispatchDraw 2s cubic-bezier(.18,.72,.18,1) forwards`;
    });

    let startTime: number | null = null;
    function placeArrow(frac: number) {
      const pos = Math.max(0, Math.min(1, frac)) * len;
      const p = line!.getPointAtLength(pos);
      const p2 = line!.getPointAtLength(Math.min(pos + 2, len));
      const angle = Math.atan2(p2.y - p.y, p2.x - p.x) * 180 / Math.PI;
      arrow!.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${angle})`);
    }
    function loop(ts: number) {
      if (startTime === null) startTime = ts;
      const elapsed = ts - startTime;
      const frac = elapsed <= INIT_DUR
        ? elapsed / INIT_DUR
        : ((elapsed - INIT_DUR) % LOOP_DUR) / LOOP_DUR;
      placeArrow(frac);
      rafRef.current = requestAnimationFrame(loop);
    }
    placeArrow(0);
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [d, animKey]);

  if (!d) return null;
  return (
    <>
      <path ref={haloRef} d={d} fill="none" stroke="rgba(255,255,255,0.88)"
        strokeWidth={width + 10} strokeLinecap="round" strokeLinejoin="round" />
      <path ref={lineRef} d={d} fill="none" stroke={color} strokeWidth={width}
        strokeLinecap="round" strokeLinejoin="round" />
      <g ref={arrowRef}>
        <polygon points="34,0 -15,-18 -7,0 -15,18"
          fill={color} stroke="white" strokeWidth={4} strokeLinejoin="round" />
      </g>
    </>
  );
}

/* ─── NavDot ─────────────────────────────────────────────── */

function NavDot({ p, active }: { p: NavPt; active?: boolean }) {
  if (p.start) return (
    <g>
      <circle cx={p.x} cy={p.y} r={28} fill={START_COLOR} opacity={0.18} />
      <circle cx={p.x} cy={p.y} r={16} fill={START_COLOR} stroke="white" strokeWidth={4} />
    </g>
  );
  if (p.pickup) return (
    <g>
      <circle cx={p.x} cy={p.y} r={active ? 26 : 20} fill={MAP_COLOR} opacity={active ? 0.22 : 0.15} />
      <circle cx={p.x} cy={p.y} r={active ? 15 : 12} fill={MAP_COLOR} stroke="white" strokeWidth={4} />
    </g>
  );
  return <circle cx={p.x} cy={p.y} r={7} fill={MAP_COLOR} opacity={0.6} stroke="white" strokeWidth={2} />;
}

/* ─── FloorMapServer — 서버 도면(image_url) 위 픽셀 좌표 렌더 ── */

function FloorMapServer({ animKey, floor, activeRoom, transformRef }: {
  animKey: number; floor: NavFloor; activeRoom?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformRef: React.MutableRefObject<any>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // points/path 의 좌표계 기준 크기. 서버가 명시(image_width/height 등)하면 그 값을,
  // 아니면 로드된 이미지의 natural 크기를 쓴다. (좌표계≠이미지 해상도일 때 정렬 어긋남 방지)
  const declaredDim = useMemo(() => {
    const w = toNum(pick(floor, ["image_width", "width", "img_width", "이미지너비", "너비"]));
    const h = toNum(pick(floor, ["image_height", "height", "img_height", "이미지높이", "높이"]));
    return w && h ? { w, h } : null;
  }, [floor]);
  const [dim, setDim] = useState<{ w: number; h: number } | null>(declaredDim);
  const [imgError, setImgError] = useState(false);
  const src = assetUrl(floor.image_url);
  const pts = useMemo(() => navPoints(floor), [floor]);
  const pathD = useMemo(() => buildFloorPath(floor), [floor]);

  useEffect(() => {
    if (!dim || !pts.length) return;
    let tries = 0;
    const run = () => {
      const api = transformRef.current, el = containerRef.current;
      // 레이아웃/ref 준비 전에 측정되면 zoom 이 어긋나므로 준비될 때까지 재시도
      if (!api || !el || el.clientWidth < 10 || el.clientHeight < 10) {
        if (tries++ < 15) requestAnimationFrame(run);
        return;
      }
      const cW = el.clientWidth, cH = el.clientHeight;
      const iAspect = dim.w / dim.h, cAspect = cW / cH;
      let iW: number, iH: number;
      if (iAspect > cAspect) { iW = cW; iH = cW / iAspect; }
      else { iH = cH; iW = cH * iAspect; }
      const avH = Math.max(cH - 200, cH * 0.5); // 하단 안내바 영역 제외
      const imgOffX = (cW - iW) / 2, imgOffY = (cH - iH) / 2;
      const sx = iW / dim.w, sy = iH / dim.h;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const cx = imgOffX + ((minX + maxX) / 2) * sx;
      const cy = imgOffY + ((minY + maxY) / 2) * sy;
      const pxW = Math.max((maxX - minX) * sx, 1);
      const pxH = Math.max((maxY - minY) * sy, 1);
      let zoom = Math.min((cW * 0.85) / pxW, (avH * 0.85) / pxH, 5);
      if (!isFinite(zoom) || zoom <= 0) zoom = 1.5;
      zoom = Math.max(zoom, 1); // 최소 1배 — 도면이 축소돼 작게 보이지 않도록
      api.setTransform(cW / 2 - cx * zoom, avH / 2 - cy * zoom, zoom, 250);
    };
    requestAnimationFrame(run);
  }, [animKey, dim, pts]); // eslint-disable-line react-hooks/exhaustive-deps

  // 도면 이미지가 없거나 로드 실패 시 좌표만으로 그리는 스키매틱으로 대체
  if (imgError) return <FloorMapSchematic animKey={animKey} floor={floor} activeRoom={activeRoom} />;

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <TransformWrapper ref={transformRef} initialScale={1} minScale={0.3} maxScale={10}
        wheel={{ step: 0.1 }} pinch={{ step: 5 }}>
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100dvh" }}
          contentStyle={{ width: "100%", height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "100%", height: "100dvh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="도면"
              onLoad={(e) => {
                // currentTarget 은 핸들러 종료 후 null 이 되므로 즉시 값만 캡처한다
                const w = e.currentTarget.naturalWidth, h = e.currentTarget.naturalHeight;
                setDim((prev) => prev ?? { w, h });
              }}
              onError={() => setImgError(true)}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none" }} />
            {dim && (
              <svg viewBox={`0 0 ${dim.w} ${dim.h}`} preserveAspectRatio="xMidYMid meet"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                <style>{CSS_ANIM}</style>
                <AnimatedPath d={pathD} animKey={animKey} />
                {pts.map((p, i) => (
                  <NavDot key={i} p={p} active={!!activeRoom && p.room === activeRoom} />
                ))}
              </svg>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/* ─── FloorMapSchematic — 도면 이미지 없을 때 좌표만으로 표시 ── */

function FloorMapSchematic({ animKey, floor, activeRoom }: {
  animKey: number; floor: NavFloor; activeRoom?: string;
}) {
  const pts = useMemo(() => navPoints(floor), [floor]);
  const pathD = useMemo(() => buildFloorPath(floor), [floor]);
  const vBox = useMemo(() => viewBoxFor(pts), [pts]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff" }}>
      <svg viewBox={vBox} preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "calc(100% - 220px)" }}>
        <style>{CSS_ANIM}</style>
        <defs>
          <pattern id="sg" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#11111118" strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect x="-99999" y="-99999" width="199998" height="199998" fill="url(#sg)" />
        <AnimatedPath d={pathD} animKey={animKey} />
        {pts.filter((p) => p.pickup && p.room).map((p, i) => (
          <text key={`lbl${i}`} x={p.x + 20} y={p.y + 8} fontSize={22} fill="#11111199" fontWeight="600">{p.room}</text>
        ))}
        {pts.map((p, i) => <NavDot key={i} p={p} active={!!activeRoom && p.room === activeRoom} />)}
      </svg>
    </div>
  );
}

/* ─── 상단 헤더 ──────────────────────────────────────────── */

function NavHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-[#f2f4f7] px-5 pt-safe-top"
      style={{ height: "calc(56px + env(safe-area-inset-top))" }}>
      <button onClick={onBack} aria-label="뒤로" className="flex size-6 items-center justify-center">
        <ArrowLeft size={24} className="text-[#111827]" />
      </button>
      <p className="text-lg font-bold text-[#111827]">{title}</p>
      <div className="flex items-center gap-4 text-[#111827]">
        <Phone size={20} />
        <MoreVertical size={20} />
      </div>
    </div>
  );
}

/* ─── 하단 안내/버튼 바 ───────────────────────────────────── */

function GuideBar({ guide, isLast, primaryLabel, primaryIcon, onPrev, onPrimary }: {
  guide: string; isLast: boolean; primaryLabel: string;
  primaryIcon?: React.ReactNode; onPrev: () => void; onPrimary: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-4 bg-[#f2f4f7] px-5 pt-4 pb-safe-bottom">
      <p className="text-2xl font-bold leading-snug text-[#111827]">{guide}</p>
      <div className="flex items-stretch gap-3">
        <button onClick={onPrev}
          className="flex h-[52px] w-[100px] items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-base font-semibold text-[#111827]">
          이전
        </button>
        <button onClick={onPrimary}
          className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0043ff] text-base font-semibold text-white">
          {primaryIcon}
          {isLast ? "수거 완료" : primaryLabel}
        </button>
      </div>
    </div>
  );
}

/* ─── 수거 안내: 물품 테이블 ──────────────────────────────── */

const COLLECT_COLS = ["순번", "품명", "수량", "설치장소"] as const;

function CollectTable({ items }: { items: DispatchItem[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid min-w-full gap-2" style={{ gridTemplateColumns: "auto 1fr auto 1.6fr" }}>
        {COLLECT_COLS.map((c) => (
          <div key={c} className="flex items-center justify-center py-2.5 text-base font-semibold text-[#4b5563]">{c}</div>
        ))}
        {items.map((it, i) => {
          const cell = "flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#475569]";
          return (
            <div key={i} className="contents">
              <div className={cell.replace("bg-white", "bg-[#d0ddef]")}>{i + 1}</div>
              <div className={cell}>{it.품명}</div>
              <div className={cell}>{it.수량}</div>
              <div className={`${cell} text-center`}>{it.설치장소 || "-"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── 사진 올리기 바텀시트 (로컬 미리보기 — 서버 업로드는 추후 구현) ── */

function PhotoUploadSheet({ room, onClose, onDone }: {
  room: string; onClose: () => void; onDone: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setPreview(URL.createObjectURL(f));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex w-full flex-col gap-6 rounded-t-3xl bg-white px-6 pb-11 pt-3 shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <div className="flex justify-center">
          <span className="h-1 w-9 rounded-full bg-[#e5e7eb]" />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold text-[#111827]">사진 올리기</p>
          <button onClick={onClose} aria-label="닫기"
            className="flex size-8 items-center justify-center rounded-2xl bg-[#f2f4f7]">
            <X size={20} className="text-[#111827]" />
          </button>
        </div>
        <button onClick={() => fileRef.current?.click()}
          className="flex h-[360px] w-full items-center justify-center overflow-hidden rounded-3xl border border-[#e5e7eb] bg-[#e5e7eb]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`${room} 수거 사진`} className="size-full object-cover" />
          ) : (
            <ImageIcon size={48} className="text-[#9ca3af]" />
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        <div className="flex flex-col gap-3">
          <button onClick={() => fileRef.current?.click()}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#0043ff] bg-white text-base font-semibold text-[#0043ff]">
            <Upload size={20} />
            {preview ? "다시 촬영하기" : "사진 촬영하기"}
          </button>
          <button onClick={onDone} disabled={!preview}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0043ff] text-base font-semibold text-white disabled:bg-[#d0ddef] disabled:text-[#6b7fa0]">
            다음
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── 전체 완료 화면 ──────────────────────────────────────── */

function CompletionScreen({ count, elapsed, onHome }: { count: number; elapsed: string; onHome: () => void; }) {
  return (
    <div className="font-pretendard fixed inset-0 flex flex-col items-center justify-center bg-[#f2f4f7] p-10">
      <div className="flex w-full flex-col items-center gap-8">
        <PartyPopper size={84} className="text-[#0043ff]" strokeWidth={1.6} />
        <div className="flex w-full flex-col items-center gap-3 text-center">
          <p className="text-[28px] font-extrabold text-[#0043ff]">수거 완료!</p>
          <p className="text-lg font-medium text-[#4b5563]">수고하셨습니다~~</p>
        </div>
        <div className="flex w-full flex-col gap-4 rounded-[20px] bg-white p-5 text-sm">
          <div className="flex items-center justify-between">
            <p className="text-[#9ca3af]">완료된 작업</p>
            <p className="font-bold text-black">{count}건</p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[#9ca3af]">총 소요시간</p>
            <p className="font-bold text-black">{elapsed}</p>
          </div>
        </div>
      </div>
      <button onClick={onHome}
        className="absolute inset-x-10 bottom-[calc(60px+env(safe-area-inset-bottom))] flex h-[53px] items-center justify-center rounded-xl bg-[#0043ff] text-lg font-semibold text-white">
        홈으로
      </button>
    </div>
  );
}

/* ─── 작업 목록 (전체 경로 오버뷰) ────────────────────────────
   출동 직후, 바로 길안내로 들어가지 않고 이 슬롯의 전체 정류장을
   타임라인으로 먼저 보여준다. (Figma: 네비 - 작업 목록)             */

function slotLabel(iso: string): { title: string; range: string } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { title: "출발 건", range: "" };
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

/** 진행 상태: 지나간(past) / 현재(current) / 이후(future) */
type StopState = "past" | "current" | "future";

function OverviewCard({ card, highlight }: { card: DispatchCard; highlight?: boolean }) {
  return (
    <div className={`flex w-full flex-col gap-3.5 rounded-xl px-[18px] py-4 ${
      highlight ? "bg-[#e2e8f0] text-[#1e293b]" : "border border-[#e2e8f0] bg-[#f2f4f7] text-[#94a3b8]"
    }`}>
      <div className="flex items-start justify-between">
        <p className="text-sm">{card.신청번호}</p>
        <p className="text-xs">{card.신청일자}</p>
      </div>
      <div className={`flex items-end gap-1.5 ${highlight ? "text-[#475569]" : ""}`}>
        <p className="text-base font-bold">{card.신청부서}</p>
        <p className="truncate text-[13px]">{card.itemSummary}</p>
      </div>
    </div>
  );
}

/* 진행 타임라인 규칙 (Figma: 네비 - 작업 목록)
   - 점(dot): 현재 정류장까지 파란색(#5b86ff), 이후는 회색(#e2e8f0)  → dotBlue
   - 선(line): 현재 직전 구간까지 파란색, 현재 이후는 회색           → lineBlue
   - 제목: 지나간 곳만 회색(#94a3b8), 현재·이후는 진한색(#1e293b)
   - 카드: 현재만 하이라이트(#e2e8f0), 나머지는 회색 카드 */
function OverviewStop({ stop, isLast, state, dotBlue, lineBlue }: {
  stop: DispatchStop; isLast: boolean; state: StopState; dotBlue: boolean; lineBlue: boolean;
}) {
  const isCurrent = state === "current";
  const DotIcon = stop.kind === "warehouse" ? Home : MapPin;
  const dotBorder = dotBlue ? "border-[#5b86ff]" : "border-[#e2e8f0]";
  const dotIconColor = dotBlue ? "text-[#5b86ff]" : "text-[#94a3b8]";
  const lineColor = lineBlue ? "bg-[#5b86ff]" : "bg-[#e2e8f0]";
  const titleColor = state === "past" ? "text-[#94a3b8]" : "text-[#1e293b]";
  return (
    <div className="flex gap-4">
      <div className="flex w-6 flex-col items-center self-stretch">
        <div className={`flex size-6 items-center justify-center rounded-xl border-2 bg-white ${dotBorder}`}>
          <DotIcon size={12} className={dotIconColor} />
        </div>
        {!isLast && <div className={`w-0.5 flex-1 rounded-[1px] ${lineColor}`} />}
      </div>
      <div className={`flex flex-1 flex-col gap-3 ${isCurrent ? "mb-8 rounded-xl border-2 border-[#5b86ff] bg-white p-4" : "pb-8"}`}>
        <p className={`font-bold ${stop.kind === "warehouse" ? "text-sm" : "text-base"} ${titleColor}`}>{stop.건물명}</p>
        {stop.cards.map((c, i) => <OverviewCard key={i} card={c} highlight={isCurrent} />)}
      </div>
    </div>
  );
}

function OverviewScreen({ plan, onBack, onStart, onSkip }: {
  plan: DispatchPlan; onBack: () => void; onStart: () => void; onSkip: () => void;
}) {
  const { title, range } = slotLabel(plan.출동일시);
  // 출동 직후 오버뷰: 첫 번째 건물 정류장이 '현재 진행 중'.
  // 창고 출발 등 그 앞은 지나간 것으로, 이후 정류장은 아직 안 간 것으로 표시.
  const currentIdx = plan.stops.findIndex((s) => s.kind === "building");
  return (
    <div className="font-pretendard fixed inset-0 flex flex-col bg-[#f2f4f7]">
      <div className="flex items-center gap-3 border-b border-[#e2e8f0] px-5 pt-safe-top"
        style={{ height: "calc(56px + env(safe-area-inset-top))" }}>
        <button onClick={onBack} aria-label="뒤로" className="flex size-6 items-center justify-center">
          <ArrowLeft size={24} className="text-[#1e293b]" />
        </button>
        <div className="flex items-end gap-3">
          <p className="text-xl font-extrabold text-[#1e293b]">{title}</p>
          {range && <p className="pb-0.5 text-base text-[#475569]">{range}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-[92px] pt-5">
        {plan.stops.map((stop, i) => {
          const state: StopState = i < currentIdx ? "past" : i === currentIdx ? "current" : "future";
          return (
            <OverviewStop
              key={i}
              stop={stop}
              isLast={i === plan.stops.length - 1}
              state={state}
              dotBlue={i <= currentIdx}
              lineBlue={i < currentIdx}
            />
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 flex items-center gap-2 bg-[#f2f4f7] px-4 pb-safe-bottom pt-3">
        <button onClick={onSkip}
          className="flex h-[52px] items-center justify-center rounded-xl bg-white px-5 text-lg font-semibold text-[#111827]">
          건너뛰기
        </button>
        <button onClick={onStart}
          className="flex h-[52px] flex-1 items-center justify-center rounded-xl bg-[#0043ff] text-lg font-semibold text-white">
          길안내
        </button>
      </div>
    </div>
  );
}

/* ─── walk-through 스텝 파생 ──────────────────────────────── */

type WalkStep =
  | { kind: "move"; 건물명: string; floorLabel: string; floor: NavFloor; activeRoom?: undefined }
  | { kind: "pickup"; 건물명: string; floorLabel: string; floor: NavFloor | null; room: string; items: DispatchItem[] };

function roomKey(s: string): string {
  const m = s.match(/([A-Za-z]?\s?[Bb]?\d+\s*호)/);
  return (m ? m[1] : s).replace(/\s+/g, "");
}
function itemsForRoom(items: DispatchItem[], room: string): DispatchItem[] {
  if (!room) return items;
  const rk = roomKey(room);
  const hit = items.filter((it) => roomKey(it.설치장소) === rk || it.설치장소.replace(/\s+/g, "").includes(rk));
  return hit.length ? hit : items;
}

/** 건물별 navigation 을 [이동→수거] 스텝으로 펼친다.
 *  도면·좌표가 없는 건물은 건물 단위 수거 스텝 하나로 대체(수거·사진은 계속 가능). */
function buildWalk(buildings: DispatchBuilding[], navs: Record<number, NavigationResponse | "error" | undefined>): WalkStep[] {
  const out: WalkStep[] = [];
  for (const b of buildings) {
    const nav = navs[b.scheduleId];
    const floors = nav && nav !== "error" && Array.isArray(nav.floors) ? nav.floors : [];
    const usable = floors.filter((f) => (Array.isArray(f.points) && f.points.length > 0) || f.image_url);
    let pickupAdded = false;
    usable.forEach((floor, fi) => {
      const fl = floorLabelOf(floor, fi);
      out.push({ kind: "move", 건물명: b.건물명, floorLabel: fl, floor });
      navPoints(floor).filter((p) => p.pickup).forEach((p) => {
        out.push({ kind: "pickup", 건물명: b.건물명, floorLabel: fl, floor, room: p.room, items: itemsForRoom(b.items, p.room) });
        pickupAdded = true;
      });
    });
    if (!pickupAdded) {
      // 동선 없음(또는 수거 포인트 미표기) → 건물 단위 수거 스텝
      out.push({ kind: "pickup", 건물명: b.건물명, floorLabel: "", floor: null, room: "", items: b.items });
    }
  }
  return out;
}

/* ─── Page ───────────────────────────────────────────────── */

export default function DispatchPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [buildings, setBuildings] = useState<DispatchBuilding[] | null>(null);
  const [navs, setNavs] = useState<Record<number, NavigationResponse | "error" | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<"overview" | "nav">("overview");
  const [stepIdx, setStepIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(Date.now());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const saved = localStorage.getItem("gwanzae-dispatch-plan");
        if (!saved) throw new Error("출동 정보가 없습니다. 오늘 화면에서 출동을 눌러 다시 시작해주세요.");
        let p: DispatchPlan;
        try { p = JSON.parse(saved); } catch { throw new Error("저장된 출동 정보를 읽지 못했습니다."); }
        const list: DispatchBuilding[] = (p.stops ?? [])
          .filter((s) => s.kind === "building" && s.scheduleId != null)
          .map((s) => ({ 건물명: s.건물명, scheduleId: s.scheduleId!, items: s.items ?? [] }));
        if (list.length === 0) throw new Error("출동할 건물이 없습니다.");
        setPlan(p);
        setBuildings(list);

        const results = await Promise.all(
          list.map((b) => scheduleNavigation(b.scheduleId).then(
            (r) => [b.scheduleId, r] as const,
            (e) => { console.warn("[dispatch] navigation 실패", b.scheduleId, e); return [b.scheduleId, "error"] as const; },
          )),
        );
        const map: Record<number, NavigationResponse | "error"> = {};
        for (const [id, r] of results) map[id] = r;
        console.log("[dispatch] navigation 결과:", list.map((b) => {
          const r = map[b.scheduleId];
          return { 건물명: b.건물명, scheduleId: b.scheduleId, 상태: r === "error" ? "error" : r?.상태, floors: r === "error" ? 0 : r?.floors?.length ?? 0 };
        }));
        setNavs(map);
        setStepIdx(0);
        setAnimKey((k) => k + 1);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const steps = useMemo(() => (buildings ? buildWalk(buildings, navs) : []), [buildings, navs]);

  if (loading) {
    return (
      <div style={{
        position: "fixed", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
        background: "#fff", fontFamily: '-apple-system, "Noto Sans KR", sans-serif',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%",
          border: "4px solid #e5e5e5", borderTopColor: "#111",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>동선 불러오는 중...</p>
      </div>
    );
  }

  if (error || steps.length === 0) {
    return (
      <div style={{
        position: "fixed", inset: 0, overflowY: "auto",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
        background: "#fff", fontFamily: '-apple-system, "Noto Sans KR", sans-serif', padding: "48px 24px 40px",
      }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 12 }}>동선을 불러오지 못했어요</p>
        {error && (
          <pre style={{
            width: "100%", maxWidth: 480, background: "#f5f5f5", borderRadius: 12, padding: "14px 16px",
            fontSize: 12, color: "#c00", fontFamily: "monospace", wordBreak: "break-all", whiteSpace: "pre-wrap", marginBottom: 12,
          }}>{error}</pre>
        )}
        <button onClick={() => router.push("/today")}
          style={{ marginTop: 8, padding: "12px 28px", borderRadius: 12, border: "none", background: "#111", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          오늘 화면으로
        </button>
      </div>
    );
  }

  // 출동 직후: 전체 경로(작업 목록) 오버뷰를 먼저 보여준다. [길안내]/[건너뛰기] → 층별 네비
  if (phase === "overview" && plan) {
    const startNav = () => { setPhase("nav"); setStepIdx(0); setAnimKey((k) => k + 1); };
    return (
      <OverviewScreen plan={plan} onBack={() => router.push("/today")} onStart={startNav} onSkip={startNav} />
    );
  }

  const safeIdx = Math.min(stepIdx, steps.length - 1);
  const step = steps[safeIdx];
  const isLast = safeIdx === steps.length - 1;
  const isPickup = step.kind === "pickup";

  const roomLabel = isPickup && step.room ? (step.room.endsWith("호") ? step.room : `${step.room}호`) : "";
  const headerTitle = roomLabel ? `${step.건물명} ${roomLabel}` : step.건물명;

  // 이동(move) 스텝: 도착 목표(그 층의 수거 호수)를 뽑아 방향 지시문을 만든다.
  const moveRooms = !isPickup
    ? navPoints(step.floor).filter((p) => p.pickup && p.room).map((p) => (p.room.endsWith("호") ? p.room : `${p.room}호`))
    : [];
  const guideText = isPickup
    ? (roomLabel ? `${roomLabel}에서 물품을 수거하세요` : `${step.건물명}에서 물품을 수거하세요`)
    : moveRooms.length
      ? `${step.floorLabel} ${moveRooms.join("·")}(으)로 이동하세요`
      : `${step.건물명} ${step.floorLabel}(으)로 이동하세요`;

  function go(dir: 1 | -1) {
    const next = safeIdx + dir;
    if (next >= 0 && next < steps.length) { setStepIdx(next); setAnimKey((k) => k + 1); setPhotoOpen(false); }
  }

  async function finish() {
    try {
      const rawApps = localStorage.getItem("gwanzae-dispatch-apps");
      const appNumbers: string[] = rawApps ? JSON.parse(rawApps) : [];
      if (appNumbers.length > 0) {
        const all = await listApplications();
        const targets = all.filter((a) => appNumbers.includes(a.신청번호));
        await Promise.all(targets.map((a) => completeApplication(a.id)));
      }
    } catch { /* 완료 처리 실패해도 완료 화면은 보여준다 */ }

    localStorage.removeItem("gwanzae-dispatch-plan");
    localStorage.removeItem("gwanzae-dispatch-apps");
    setDone(true);
  }

  function elapsedLabel() {
    const mins = Math.max(1, Math.round((Date.now() - startRef.current) / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }

  if (done) {
    const pickupCount = steps.filter((s) => s.kind === "pickup").length;
    return <CompletionScreen count={pickupCount} elapsed={elapsedLabel()} onHome={() => router.push("/today")} />;
  }

  function handlePrimary() {
    if (isPickup) { setPhotoOpen(true); return; }
    go(1);
  }
  function afterPhoto() {
    setPhotoOpen(false);
    if (isLast) finish(); else go(1);
  }

  return (
    <div className="font-pretendard fixed inset-0 overflow-hidden bg-[#f2f4f7]">
      <NavHeader title={headerTitle} onBack={() => (safeIdx === 0 ? setPhase("overview") : go(-1))} />

      {isPickup ? (
        <div className="absolute inset-x-0 overflow-y-auto px-5"
          style={{ top: "calc(56px + env(safe-area-inset-top))", bottom: 160 }}>
          <CollectTable items={step.items} />
        </div>
      ) : (
        <div className="absolute inset-x-0"
          style={{ top: "calc(56px + env(safe-area-inset-top))", bottom: 0 }}>
          {step.floor.image_url ? (
            <FloorMapServer animKey={animKey} floor={step.floor} transformRef={transformRef} />
          ) : (
            <FloorMapSchematic animKey={animKey} floor={step.floor} />
          )}
        </div>
      )}

      <GuideBar
        guide={guideText}
        isLast={isLast}
        primaryLabel={isPickup ? "사진 촬영하기" : "다음"}
        primaryIcon={isPickup ? <Camera size={20} /> : undefined}
        onPrev={() => go(-1)}
        onPrimary={handlePrimary}
      />

      {photoOpen && isPickup && (
        <PhotoUploadSheet room={roomLabel || step.건물명} onClose={() => setPhotoOpen(false)} onDone={afterPhoto} />
      )}
    </div>
  );
}
