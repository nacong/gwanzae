"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import rawRoute from "@/lib/demo_route.json";
import mappingRaw from "@/lib/mapping.json";

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

const STEP_TYPE: Record<string, { label: string; color: string; bg: string }> = {
  move_to_transition: { label: "이동",   color: "#546E7A", bg: "#ECEFF1" },
  floor_transition:   { label: "층 이동", color: "#1565C0", bg: "#E3F2FD" },
  pickup:             { label: "수거",   color: "#BF360C", bg: "#FBE9E7" },
  exit:               { label: "완료",   color: "#1B5E20", bg: "#E8F5E9" },
};

const CSS_ANIM = `@keyframes dispatchDraw { to { stroke-dashoffset: 0; } }`;

/* ─── types ──────────────────────────────────────────────── */

interface PickupItem { 호수: string; 품명: string; 수량: number; }

interface NodeData {
  id: string; x: number; y: number; floor: string;
  node_type: string; is_pickup: boolean; is_elevator: boolean;
  is_stair: boolean; is_start: boolean; assigned_rooms: string[];
  pickup_items: PickupItem[];
}

interface EnrichedNode extends NodeData {
  px: number; py: number; /* 변환된 픽셀 좌표 */
}

interface EdgeData {
  order: number; from: string; to: string;
  from_floor: string; to_floor: string;
  edge_type: string; is_floor_transition: boolean;
}

interface StepData {
  step_no: number; step_type: string; guide_text: string; floor: string;
  node_sequence: string[]; nodes: NodeData[]; edges: EdgeData[];
  trigger_node: string; is_last_step: boolean;
}

/* ─── data ───────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BDATA    = (rawRoute as any).건물별경로안내[0];
const BLD_NAME: string  = BDATA.건물명;
const STEPS: StepData[] = BDATA.steps;
const MAPPED   = ALIAS[BLD_NAME] ?? BLD_NAME;

/* ─── helpers ────────────────────────────────────────────── */

function floorLabel(f: string) { return f.replace(/(\d+)F/, "$1층"); }

/** 노드 좌표계 → 도면 픽셀 좌표 변환 */
function enrichNodes(nodes: NodeData[]): EnrichedNode[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapping = mappingRaw as any;
  return nodes.map(n => {
    const m = mapping[MAPPED]?.[n.floor];
    if (m) return { ...n, px: n.x * m.scale_x + m.offset_x, py: n.y * m.scale_y + m.offset_y };
    return { ...n, px: n.x, py: n.y };
  });
}

/** floor 에 해당하는 image 크기 */
function imageDims(floor: string): { w: number; h: number } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = (mappingRaw as any)[MAPPED]?.[floor];
  return m ? { w: m.image_width, h: m.image_height } : { w: 1448, h: 1086 };
}

function buildNodeMap(nodes: EnrichedNode[]) {
  const m = new Map<string, EnrichedNode>();
  nodes.forEach(n => m.set(n.id, n));
  return m;
}

/** node_sequence에서 특정 층 노드만 걸러 SVG path 생성 */
function buildPath(seq: string[], nm: Map<string, EnrichedNode>, floor: string): string {
  const pts: string[] = [];
  for (const id of seq) {
    const n = nm.get(id);
    if (n?.floor === floor) pts.push(`${n.px},${n.py}`);
  }
  return pts.length >= 2 ? `M ${pts.join(" L ")}` : "";
}

/** 노드 집합의 tight viewBox 계산 */
function viewBoxFor(nodes: EnrichedNode[], pad = 150): string {
  if (!nodes.length) return "0 0 1448 1086";
  const xs = nodes.map(n => n.px), ys = nodes.map(n => n.py);
  const x1 = Math.min(...xs) - pad, y1 = Math.min(...ys) - pad;
  const x2 = Math.max(...xs) + pad, y2 = Math.max(...ys) + pad;
  return `${x1} ${y1} ${x2 - x1} ${y2 - y1}`;
}


/* ─── AnimatedPath ───────────────────────────────────────── */

const INIT_DUR = 2000;   // path 그리기 애니메이션 시간 (ms) — CSS 와 동일
const LOOP_DUR = 3800;   // 화살표 루프 한 바퀴 시간 (ms)

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

    // ── CSS draw animation ──
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

    // ── Arrow RAF animation ──
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
        strokeLinecap="round" strokeLinejoin="round"
         />
      <g ref={arrowRef}>
        <polygon points="34,0 -15,-18 -7,0 -15,18"
          fill={color} stroke="white" strokeWidth={4} strokeLinejoin="round" />
      </g>
    </>
  );
}

/* ─── NodeDot ────────────────────────────────────────────── */

const START_COLOR = "#E53935";

function NodeDot({ n, color, role }: { n: EnrichedNode; color: string; role?: "start" | "end" }) {
  const { px, py } = n;
  const dotColor = role === "start" ? START_COLOR : color;

  if (role === "start" || role === "end") return (
    <g>
      <circle cx={px} cy={py} r={28} fill={dotColor} opacity={0.18} />
      <circle cx={px} cy={py} r={16} fill={dotColor} stroke="white" strokeWidth={4} />
      {n.pickup_items.map((it, i) => (
        <text key={i} x={px} y={py - 30} textAnchor="middle" fontSize={26} fontWeight="800" fill={dotColor}>
          {it.호수}호
        </text>
      ))}
    </g>
  );
  if (n.is_elevator) {
    const r = 12;
    return <rect x={px - r} y={py - r} width={r * 2} height={r * 2} rx={4}
      fill={color} opacity={0.75} stroke="white" strokeWidth={3} />;
  }
  return <circle cx={px} cy={py} r={9} fill={color} stroke="white" strokeWidth={2} />;
}

/* ─── FloorMapReal (실제 도면 이미지) ───────────────────── */

const MAP_COLOR = "#1976D2";

function nodeRoles(fNodes: EnrichedNode[], nodeSequence: string[]): Record<string, "start" | "end"> {
  const fIds = new Set(fNodes.map(n => n.id));
  const onFloor = nodeSequence.filter(id => fIds.has(id));
  const roles: Record<string, "start" | "end"> = {};
  if (onFloor.length > 0) roles[onFloor[0]] = "start";
  if (onFloor.length > 1) roles[onFloor[onFloor.length - 1]] = "end";
  return roles;
}

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

    // objectFit:contain 기준 실제 이미지 렌더 크기
    const iAspect = imageW / imageH, cAspect = cW / cH;
    let iW: number, iH: number;
    if (iAspect > cAspect) { iW = cW; iH = cW / iAspect; }
    else { iH = cH; iW = cH * iAspect; }

    const avH = cH - 220;

    // 경로 중심으로 즉시 확대 (애니메이션 없음)
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
              {fNodes.map(n => <NodeDot key={n.id} n={n} color={color} role={roles[n.id]} />)}
            </svg>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/* ─── FloorMapSchematic (도면 없는 층 다이어그램) ─────── */

function FloorMapSchematic({ animKey, fNodes, pathD, displayFloor, nodeSequence }: {
  animKey: number; fNodes: EnrichedNode[]; pathD: string; displayFloor: string; nodeSequence: string[];
}) {
  const color  = MAP_COLOR;
  const roles  = nodeRoles(fNodes, nodeSequence);
  const vBox   = useMemo(() => viewBoxFor(fNodes), [fNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "#fff",
    }}>
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
        {fNodes.map(n => <NodeDot key={n.id} n={n} color={color} role={roles[n.id]} />)}
      </svg>
    </div>
  );
}

/* ─── BottomPanel ────────────────────────────────────────── */

function BottomPanel({ step, stepIdx, total, onPrev, onNext }: {
  step: StepData; stepIdx: number; total: number;
  onPrev: () => void; onNext: () => void;
}) {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
      background: "white", borderRadius: "20px 20px 0 0",
      padding: "14px 20px calc(20px + env(safe-area-inset-bottom))",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* 진행 바 */}
      <div style={{ height: 3, background: "#eee", borderRadius: 99, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${((stepIdx + 1) / total) * 100}%`,
          background: "#111", borderRadius: 99, transition: "width 0.4s ease",
        }} />
      </div>

      {/* 카운터 */}
      <span style={{ fontSize: 13, color: "#aaa", fontWeight: 600 }}>{stepIdx + 1} / {total}</span>

      {/* 안내 텍스트 */}
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.45, color: "#111" }}>
        {step.guide_text}
      </div>

      {/* 버튼 */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onPrev} disabled={stepIdx === 0} style={{
          flex: 1, padding: "14px 0", borderRadius: 14, border: "none",
          background: stepIdx === 0 ? "#f2f2f2" : "#e5e5e5",
          color: stepIdx === 0 ? "#ccc" : "#444",
          fontWeight: 700, fontSize: 16, cursor: stepIdx === 0 ? "default" : "pointer",
        }}>이전</button>
        <button onClick={onNext} disabled={step.is_last_step} style={{
          flex: 3, padding: "14px 0", borderRadius: 14, border: "none",
          background: step.is_last_step ? "#555" : "#111",
          color: "white", fontWeight: 700, fontSize: 16,
          cursor: step.is_last_step ? "default" : "pointer",
        }}>
          {step.is_last_step ? "✓ 수거 완료" : "다음 →"}
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────── */

export default function DispatchPage() {
  const [stepIdx, setStepIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformRef = useRef<any>(null);

  const step = STEPS[stepIdx];
  const dFloor     = step.floor;
  const floorColor = FLOOR_COLOR[dFloor] ?? "#607D8B";
  const floorImg   = FLOOR_IMAGES[dFloor] ?? null;

  const enriched = useMemo(() => enrichNodes(step.nodes), [step]);
  const nodeMap  = useMemo(() => buildNodeMap(enriched), [enriched]);
  const fNodes   = useMemo(() => enriched.filter(n => n.floor === dFloor), [enriched, dFloor]);
  const pathD    = useMemo(() => buildPath(step.node_sequence, nodeMap, dFloor), [step.node_sequence, nodeMap, dFloor]);
  const dims     = useMemo(() => imageDims(dFloor), [dFloor]);

  function go(dir: 1 | -1) {
    const next = stepIdx + dir;
    if (next >= 0 && next < STEPS.length) { setStepIdx(next); setAnimKey(k => k + 1); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, overflow: "hidden",
      background: "#fff",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif',
    }}>

      {/* ── 지도 영역 ── */}
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

      <BottomPanel
        step={step} stepIdx={stepIdx} total={STEPS.length}
        onPrev={() => go(-1)} onNext={() => go(1)}
      />
    </div>
  );
}
