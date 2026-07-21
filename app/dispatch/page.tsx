"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ArrowLeft, Phone, MoreVertical, Camera, X, ImageIcon, Upload, PartyPopper } from "lucide-react";
import mappingRaw from "@/lib/mapping.json";
import {
  listApplications, completeApplication,
  type RoutePickupItem, type RouteNode, type RouteStep, type RouteBuilding,
} from "@/lib/api";

/* ─── constants ──────────────────────────────────────────── */

/** 백엔드 건물명 약칭 → mapping.json 키 */
const ALIAS: Record<string, string> = { "전정대": "전자정보대학" };

/** 실제 도면 이미지가 있는 층 */
const FLOOR_IMAGES: Record<string, string> = {
  "1F": "/floor_1f.png",
  "2F": "/floor_2f.png",
  "3F": "/floor_3f.png",
  "5F": "/floor_5f.png",
};

const FLOOR_COLOR: Record<string, string> = {
  "1F": "#1976D2", "2F": "#7B1FA2", "3F": "#C62828",
  "4F": "#2E7D32", "5F": "#E65100",
};

const CSS_ANIM = `@keyframes dispatchDraw { to { stroke-dashoffset: 0; } }`;

/* ─── types (lib/api.ts의 동선 타입 재사용) ─────────────────── */

type PickupItem = RoutePickupItem;
type NodeData = RouteNode;
type StepData = RouteStep;

interface EnrichedNode extends NodeData {
  px: number; py: number;
}

type RouteResponse = RouteBuilding[];

/* ─── helpers ────────────────────────────────────────────── */

function floorLabel(f: string) { return f.replace(/(\d+)F/, "$1층"); }

function enrichNodes(nodes: NodeData[], mapped: string): EnrichedNode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapping = mappingRaw as any;
  return nodes.map(n => {
    const m = mapping[mapped]?.[n.floor];
    if (m) return { ...n, px: n.x * m.scale_x + m.offset_x, py: n.y * m.scale_y + m.offset_y };
    return { ...n, px: n.x, py: n.y };
  });
}

function imageDims(floor: string, mapped: string): { w: number; h: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (mappingRaw as any)[mapped]?.[floor];
  return m ? { w: m.image_width, h: m.image_height } : { w: 1448, h: 1086 };
}

function buildNodeMap(nodes: EnrichedNode[]) {
  const m = new Map<string, EnrichedNode>();
  nodes.forEach(n => m.set(n.id, n));
  return m;
}

/* ─── 경로 표시용 후처리 ─────────────────────────────────── */

type Pt = { x: number; y: number };

function ptToLine(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function simplifyRoute(pts: Pt[], tol = 10): Pt[] {
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

function makeRoundedPath(pts: Pt[], radius = 20): string {
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

function buildPath(seq: string[], nm: Map<string, EnrichedNode>, floor: string): string {
  const raw: Pt[] = [];
  for (const id of seq) {
    const n = nm.get(id);
    if (n?.floor === floor) raw.push({ x: n.px, y: n.py });
  }
  if (raw.length < 2) return "";
  return makeRoundedPath(simplifyRoute(raw, 20), 20);
}

function viewBoxFor(nodes: EnrichedNode[], pad = 150): string {
  if (!nodes.length) return "0 0 1448 1086";
  const xs = nodes.map(n => n.px), ys = nodes.map(n => n.py);
  const x1 = Math.min(...xs) - pad, y1 = Math.min(...ys) - pad;
  const x2 = Math.max(...xs) + pad, y2 = Math.max(...ys) + pad;
  return `${x1} ${y1} ${x2 - x1} ${y2 - y1}`;
}

/* ─── AnimatedPath ───────────────────────────────────────── */

const INIT_DUR = 2000;
const LOOP_DUR = 3800;

function AnimatedPath({ d, color = "#1976D2", width = 12, animKey }: {
  d: string; color?: string; width?: number; animKey: number;
}) {
  const haloRef  = useRef<SVGPathElement>(null);
  const lineRef  = useRef<SVGPathElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const line = lineRef.current, halo = haloRef.current, arrow = arrowRef.current;
    if (!line || !halo || !arrow || !d) return;

    const len = line.getTotalLength();
    [line, halo].forEach(el => {
      el.style.strokeDasharray = String(len);
      el.style.strokeDashoffset = String(len);
      el.style.animation = "none";
    });
    void line.getBoundingClientRect();
    [line, halo].forEach(el => {
      el.style.animation = `dispatchDraw 2s cubic-bezier(.18,.72,.18,1) forwards`;
    });

    let startTime: number | null = null;

    function placeArrow(frac: number) {
      const pos = Math.max(0, Math.min(1, frac)) * len;
      const p  = line!.getPointAtLength(pos);
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
  }, [d, animKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

/* ─── NodeDot ────────────────────────────────────────────── */

const START_COLOR = "#E53935";
const MAP_COLOR   = "#1976D2";

function NodeDot({ n, color, role }: { n: EnrichedNode; color: string; role?: "start" | "end" }) {
  const { px, py } = n;
  const dotColor = role === "start" ? START_COLOR : color;

  if (role === "start" || role === "end") return (
    <g>
      <circle cx={px} cy={py} r={28} fill={dotColor} opacity={0.18} />
      <circle cx={px} cy={py} r={16} fill={dotColor} stroke="white" strokeWidth={4} />
    </g>
  );
  if (n.is_elevator) {
    const r = 12;
    return <rect x={px - r} y={py - r} width={r * 2} height={r * 2} rx={4}
      fill={color} opacity={0.75} stroke="white" strokeWidth={3} />;
  }
  return <circle cx={px} cy={py} r={9} fill={color} stroke="white" strokeWidth={2} />;
}

function nodeRoles(fNodes: EnrichedNode[], nodeSequence: string[]): Record<string, "start" | "end"> {
  const fIds = new Set(fNodes.map(n => n.id));
  const onFloor = nodeSequence.filter(id => fIds.has(id));
  const roles: Record<string, "start" | "end"> = {};
  if (onFloor.length > 0) roles[onFloor[0]] = "start";
  if (onFloor.length > 1) roles[onFloor[onFloor.length - 1]] = "end";
  return roles;
}

/* ─── FloorMapReal ───────────────────────────────────────── */

function FloorMapReal({ animKey, fNodes, pathD, floorImg, imageW, imageH, transformRef, nodeSequence }: {
  animKey: number; fNodes: EnrichedNode[]; pathD: string;
  floorImg: string; imageW: number; imageH: number; nodeSequence: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transformRef: React.MutableRefObject<any>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const color = MAP_COLOR;
  const roles = nodeRoles(fNodes, nodeSequence);

  useEffect(() => {
    const api = transformRef.current, el = containerRef.current;
    if (!api || !el) return;
    const cW = el.clientWidth, cH = el.clientHeight;

    const iAspect = imageW / imageH, cAspect = cW / cH;
    let iW: number, iH: number;
    if (iAspect > cAspect) { iW = cW; iH = cW / iAspect; }
    else { iH = cH; iW = cH * iAspect; }

    const avH = cH - 220;
    const zoom = Math.min(avH / (iH * 1.2), 8);
    const imgOffX = (cW - iW) / 2, imgOffY = (cH - iH) / 2;
    let cx = cW / 2, cy = avH / 2;
    if (fNodes.length) {
      const xs = fNodes.map(n => n.px), ys = fNodes.map(n => n.py);
      const nodeCX = imgOffX + ((Math.min(...xs) + Math.max(...xs)) / 2) * (iW / imageW);
      const nodeCY = imgOffY + ((Math.min(...ys) + Math.max(...ys)) / 2) * (iH / imageH);
      cx = nodeCX; cy = nodeCY;
    }
    api.setTransform(cW / 2 - cx * zoom, avH / 2 - cy * zoom, zoom, 0);
  }, [animKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      <TransformWrapper ref={transformRef} initialScale={1} minScale={0.3} maxScale={10}
        wheel={{ step: 0.1 }} pinch={{ step: 5 }}>
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100dvh" }}
          contentStyle={{ width: "100%", height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "100%", height: "100dvh" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={floorImg} alt="도면"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none" }} />
            <svg viewBox={`0 0 ${imageW} ${imageH}`} preserveAspectRatio="xMidYMid meet"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
              <style>{CSS_ANIM}</style>
              <AnimatedPath d={pathD} animKey={animKey} color={color} />
              {fNodes.filter(n => roles[n.id]).map(n => <NodeDot key={n.id} n={n} color={color} role={roles[n.id]} />)}
            </svg>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/* ─── FloorMapSchematic ──────────────────────────────────── */

function FloorMapSchematic({ animKey, fNodes, pathD, nodeSequence }: {
  animKey: number; fNodes: EnrichedNode[]; pathD: string; displayFloor: string; nodeSequence: string[];
}) {
  const color = MAP_COLOR;
  const roles = nodeRoles(fNodes, nodeSequence);
  const vBox  = useMemo(() => viewBoxFor(fNodes), [fNodes]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <AnimatedPath d={pathD} color={color} animKey={animKey} />
        {fNodes.filter(n => !n.is_pickup && n.assigned_rooms.length > 0).map(n => (
          <text key={n.id + "_lbl"} x={n.px + 20} y={n.py + 8}
            fontSize={22} fill="#11111199" fontWeight="600">
            {n.assigned_rooms.slice(0, 2).join("·")}
          </text>
        ))}
        {fNodes.filter(n => roles[n.id]).map(n => <NodeDot key={n.id} n={n} color={color} role={roles[n.id]} />)}
      </svg>
    </div>
  );
}

/* ─── 상단 헤더 (네비 - 이동/수거 안내 공통) ───────────────── */

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

/* ─── 하단 안내/버튼 바 ─────────────────────────────────────── */

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

/* ─── 수거 안내: 물품 테이블 ────────────────────────────────── */

const COLLECT_COLS = ["순번", "품명", "수량", "설치장소"] as const;

function CollectTable({ items }: { items: PickupItem[] }) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-grid min-w-full gap-2"
        style={{ gridTemplateColumns: "auto 1fr auto 1.6fr" }}>
        {COLLECT_COLS.map((c) => (
          <div key={c} className="flex items-center justify-center py-2.5 text-base font-semibold text-[#4b5563]">{c}</div>
        ))}
        {items.map((it, i) => (
          <ItemRow key={i} idx={i + 1} item={it} />
        ))}
      </div>
    </div>
  );
}

function ItemRow({ idx, item }: { idx: number; item: PickupItem }) {
  const cell = "flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#475569]";
  return (
    <>
      <div className={cell.replace("bg-white", "bg-[#d0ddef]")}>{idx}</div>
      <div className={cell}>{item.품명}</div>
      <div className={cell}>{item.수량}</div>
      <div className={`${cell} text-center`}>{item.호수.endsWith("호") ? item.호수 : `${item.호수}호`}</div>
    </>
  );
}

/* ─── 사진 올리기 바텀시트 ─────────────────────────────────── */

function PhotoUploadSheet({ room, onClose, onUpload }: {
  room: string; onClose: () => void; onUpload: (file: File) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) { setPreview(URL.createObjectURL(f)); onUpload(f); }
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
          className="flex h-[400px] w-full items-center justify-center overflow-hidden rounded-3xl border border-[#e5e7eb] bg-[#e5e7eb]">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`${room}호 수거 사진`} className="size-full object-cover" />
          ) : (
            <ImageIcon size={48} className="text-[#9ca3af]" />
          )}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        <button onClick={() => fileRef.current?.click()}
          className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#0043ff] text-base font-semibold text-white">
          <Upload size={20} />
          {preview ? "다시 촬영하기" : "사진 촬영하기"}
        </button>
      </div>
    </div>
  );
}

/* ─── 전체 완료 화면 ────────────────────────────────────────── */

function CompletionScreen({ count, elapsed, onHome }: {
  count: number; elapsed: string; onHome: () => void;
}) {
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

/* ─── Page ───────────────────────────────────────────────── */

export default function DispatchPage() {
  const router = useRouter();
  const [routeData,    setRouteData]    = useState<RouteResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [rawResponse,  setRawResponse]  = useState<string | null>(null);
  const [retryCount,   setRetryCount]   = useState(0);

  const [stepIdx,  setStepIdx]  = useState(0);
  const [animKey,  setAnimKey]  = useState(0);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [done, setDone] = useState(false);
  const startRef = useRef<number>(Date.now());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformRef = useRef<any>(null);

  useEffect(() => {
    async function fetchRoute() {
      setLoading(true);
      setError(null);
      setRawResponse(null);
      try {
        const saved = localStorage.getItem("gwanzae-dispatch-route");
        if (!saved) {
          throw new Error("출동 경로 정보가 없습니다. 오늘 화면에서 출동을 눌러 다시 시작해주세요.");
        }
        let data: RouteResponse;
        try {
          data = JSON.parse(saved);
        } catch {
          throw new Error(`저장된 경로 데이터를 읽지 못했습니다: ${saved.slice(0, 200)}`);
        }
        if (!Array.isArray(data) || data.length === 0) {
          setRawResponse(JSON.stringify(data, null, 2));
          throw new Error("경로 데이터가 비어있습니다.");
        }
        setRouteData(data);
        setStepIdx(0);
        setAnimKey(k => k + 1);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchRoute();
  }, [retryCount]);

  /* ── 로딩 / 에러 화면 ── */
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
        <p style={{ fontSize: 15, color: "#888", fontWeight: 600 }}>경로 계산 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: "fixed", inset: 0, overflowY: "auto",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        background: "#fff", fontFamily: '-apple-system, "Noto Sans KR", sans-serif',
        padding: "48px 24px 40px",
      }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 12 }}>경로를 불러오지 못했어요</p>
        <pre style={{
          width: "100%", maxWidth: 480,
          background: "#f5f5f5", borderRadius: 12, padding: "14px 16px",
          fontSize: 12, color: "#c00", fontFamily: "monospace",
          wordBreak: "break-all", whiteSpace: "pre-wrap", marginBottom: 12,
        }}>{error}</pre>
        {rawResponse && (
          <pre style={{
            width: "100%", maxWidth: 480,
            background: "#f9f9f9", borderRadius: 12, padding: "14px 16px",
            fontSize: 11, color: "#555", fontFamily: "monospace",
            wordBreak: "break-all", whiteSpace: "pre-wrap", marginBottom: 12,
            maxHeight: 240, overflowY: "auto",
          }}>{rawResponse}</pre>
        )}
        <button
          onClick={() => (localStorage.getItem("gwanzae-dispatch-route") ? setRetryCount(c => c + 1) : router.push("/today"))}
          style={{
            marginTop: 8, padding: "12px 28px", borderRadius: 12, border: "none",
            background: "#111", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
          }}
        >
          {localStorage.getItem("gwanzae-dispatch-route") ? "다시 시도" : "오늘 화면으로"}
        </button>
      </div>
    );
  }

  /* ── 데이터 파싱 ── */
  if (!routeData) return null;
  const bdata    = routeData[0];
  const bldName: string   = bdata.건물명;
  const steps: StepData[] = bdata.steps ?? [];
  const mapped   = ALIAS[bldName] ?? bldName;

  const safeIdx  = Math.min(stepIdx, steps.length - 1);
  const step     = steps[safeIdx];
  if (!step) return null;
  const dFloor   = step.floor;
  const floorImg = FLOOR_IMAGES[dFloor] ?? null;

  const enriched = enrichNodes(step.nodes, mapped);
  const nodeMap  = buildNodeMap(enriched);
  const fNodes   = enriched.filter(n => n.floor === dFloor);
  const pathD    = buildPath(step.node_sequence, nodeMap, dFloor);
  const dims     = imageDims(dFloor, mapped);

  const isPickup = step.step_type === "pickup";
  const triggerNode = enriched.find(n => n.id === step.trigger_node);
  const pickupItems = triggerNode?.pickup_items ?? [];
  const room = pickupItems[0]?.호수 ?? triggerNode?.assigned_rooms?.[0] ?? "";
  const roomLabel = room && !room.endsWith("호") ? `${room}호` : room;
  const headerTitle = roomLabel ? `${bldName} ${roomLabel}` : bldName;

  function go(dir: 1 | -1) {
    const next = safeIdx + dir;
    if (next >= 0 && next < steps.length) { setStepIdx(next); setAnimKey(k => k + 1); setPhotoOpen(false); }
  }

  async function finish() {
    const groupId = localStorage.getItem("gwanzae-dispatch-group-id");
    if (groupId) {
      try {
        const raw = localStorage.getItem("gwanzae-timegroups");
        const groups = raw ? JSON.parse(raw) : [];
        localStorage.setItem("gwanzae-timegroups", JSON.stringify(groups.filter((g: { id: string }) => g.id !== groupId)));
      } catch { /* ignore */ }
      localStorage.removeItem("gwanzae-dispatch-group-id");
    }

    try {
      const rawApps = localStorage.getItem("gwanzae-dispatch-apps");
      const appNumbers: string[] = rawApps ? JSON.parse(rawApps) : [];
      if (appNumbers.length > 0) {
        const all = await listApplications();
        const targets = all.filter(a => appNumbers.includes(a.신청번호));
        await Promise.all(targets.map(a => completeApplication(a.id)));
      }
    } catch { /* 완료 처리 실패해도 완료 화면은 보여준다 */ }

    localStorage.removeItem("gwanzae-dispatch-route");
    localStorage.removeItem("gwanzae-dispatch-apps");
    setDone(true);
  }

  function elapsedLabel() {
    const mins = Math.max(1, Math.round((Date.now() - startRef.current) / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
  }

  if (done) {
    const pickupCount = steps.filter(s => s.step_type === "pickup").length;
    return (
      <CompletionScreen count={pickupCount} elapsed={elapsedLabel()} onHome={() => router.push("/today")} />
    );
  }

  function handlePrimary() {
    if (step.is_last_step) { finish(); return; }
    if (isPickup) { setPhotoOpen(true); return; }
    go(1);
  }

  return (
    <div className="font-pretendard fixed inset-0 overflow-hidden bg-[#f2f4f7]">
      <NavHeader title={headerTitle} onBack={() => (safeIdx === 0 ? router.push("/today") : go(-1))} />

      {isPickup ? (
        <div className="absolute inset-x-0 overflow-y-auto px-5"
          style={{ top: "calc(56px + env(safe-area-inset-top))", bottom: 160 }}>
          <CollectTable items={pickupItems} />
        </div>
      ) : (
        <div className="absolute inset-x-0"
          style={{ top: "calc(56px + env(safe-area-inset-top))", bottom: 0 }}>
          {floorImg ? (
            <FloorMapReal
              animKey={animKey} fNodes={fNodes} pathD={pathD}
              floorImg={floorImg} imageW={dims.w} imageH={dims.h}
              nodeSequence={step.node_sequence} transformRef={transformRef}
            />
          ) : (
            <FloorMapSchematic
              animKey={animKey} fNodes={fNodes} pathD={pathD} displayFloor={dFloor}
              nodeSequence={step.node_sequence}
            />
          )}
        </div>
      )}

      <GuideBar
        guide={step.guide_text}
        isLast={step.is_last_step}
        primaryLabel={isPickup ? "사진 촬영하기" : "다음"}
        primaryIcon={isPickup ? <Camera size={20} /> : undefined}
        onPrev={() => go(-1)}
        onPrimary={handlePrimary}
      />

      {photoOpen && (
        <PhotoUploadSheet
          room={room}
          onClose={() => setPhotoOpen(false)}
          onUpload={() => { setPhotoOpen(false); if (step.is_last_step) finish(); else go(1); }}
        />
      )}
    </div>
  );
}
