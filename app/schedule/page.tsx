"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Sparkles, ArrowLeft, ScanLine, X } from "lucide-react";
import TabBar from "@/components/TabBar";
import {
  listApplications, optimizeRun, createApplicationFromOcr, updateApplication,
  type Application, type ApplicationItem,
} from "@/lib/api";

type SortKey = "신청일순" | "출동일순";

const DAY = ["일", "월", "화", "수", "목", "금", "토"];

function itemSummary(app: Application): string {
  const list = app.물품목록 ?? [];
  const first = list[0]?.품명 ?? "품목";
  return list.length > 1 ? `${first} 외 ${list.length - 1}건` : first;
}

function isCompleted(app: Application): boolean {
  return app.상태 === "완료" || app.상태 === "수거완료" || app.상태 === "수거됨";
}

function dispatchLabel(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const hour = d.getHours();
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY[d.getDay()]}요일 ${ampm} ${h12}시 출동 예정`;
}

function StatusSection({ app }: { app: Application }) {
  if (isCompleted(app)) {
    return (
      <div className="flex h-[46px] items-center justify-center bg-[#dedede] px-[18px]">
        <p className="text-base font-medium text-[#525252]">수거됨</p>
      </div>
    );
  }
  if (app.출동일시) {
    return (
      <div className="flex min-h-[46px] items-center justify-center bg-[#e4ebff] px-[18px] py-3">
        <p className="text-center text-base font-medium text-[#0043ff]">{dispatchLabel(app.출동일시)}</p>
      </div>
    );
  }
  return (
    <div className="flex h-[46px] items-center justify-center bg-[#f1f5f9] px-[18px]">
      <p className="text-base font-medium text-[#64748b]">{app.상태 ?? "접수"}</p>
    </div>
  );
}

function OverviewCard({ app }: { app: Application }) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-white">
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <div className="flex items-start justify-between text-[#1e293b]">
          <p className="text-sm">{app.신청번호}</p>
          <p className="text-xs">{app.신청일자}</p>
        </div>
        <div className="flex items-end gap-1.5 text-[#475569]">
          <p className="text-base font-bold">{app.신청부서}</p>
          <p className="truncate text-[13px]">{itemSummary(app)}</p>
        </div>
      </div>
      <StatusSection app={app} />
    </div>
  );
}

/* ─── 여러 장의 사진을 한 장으로 합치기 (OCR API는 파일 1개만 받음) ─── */

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function mergeImagesVertically(files: File[]): Promise<File> {
  if (files.length === 1) return files[0];
  const imgs = await Promise.all(files.map(loadImage));
  const width = Math.max(...imgs.map((i) => i.naturalWidth));
  const height = imgs.reduce((sum, i) => sum + i.naturalHeight * (width / i.naturalWidth), 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  let y = 0;
  for (const img of imgs) {
    const h = img.naturalHeight * (width / img.naturalWidth);
    ctx.drawImage(img, 0, y, width, h);
    y += h;
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error("이미지 합치기에 실패했습니다.")); return; }
      resolve(new File([blob], "merged.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  });
}

/* ─── 스캔 모션 (기본정보 인식 중) ────────────────────────────── */

const SCAN_MS = 1800;

function ScanFrame({ srcs }: { srcs: string[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (srcs.length <= 1) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % srcs.length), SCAN_MS);
    return () => clearInterval(timer);
  }, [srcs.length]);

  const safeIdx = srcs.length > 0 ? idx % srcs.length : 0;
  const bracket = "absolute rounded-full bg-[#0043ff] shadow-[0_0_8px_2px_rgba(0,67,255,0.8)]";
  return (
    <div className="relative mx-auto mt-4 size-[174px] overflow-hidden rounded-xl">
      {/* 위치·크기는 고정, 이미지가 여러 장이면 한 장씩 순서대로 스캔 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={srcs[safeIdx]} alt="" className="size-full object-cover shadow-[0_0_15px_rgba(0,67,255,0.3)]" />
      <div className="pointer-events-none absolute inset-0">
        <span className={`${bracket} left-0 top-0 h-[3px] w-[30px]`} />
        <span className={`${bracket} left-0 top-0 h-[30px] w-[3px]`} />
        <span className={`${bracket} right-0 top-0 h-[3px] w-[30px]`} />
        <span className={`${bracket} right-0 top-0 h-[30px] w-[3px]`} />
        <span className={`${bracket} bottom-0 left-0 h-[3px] w-[30px]`} />
        <span className={`${bracket} bottom-0 left-0 h-[30px] w-[3px]`} />
        <span className={`${bracket} bottom-0 right-0 h-[3px] w-[30px]`} />
        <span className={`${bracket} bottom-0 right-0 h-[30px] w-[3px]`} />
        {/* key=safeIdx: 이미지가 바뀔 때마다 스캔 라인 애니메이션을 처음부터 재생 */}
        <div
          key={safeIdx}
          className="animate-scan-line absolute inset-x-0 h-0.5 shadow-[0_0_12px_1px_rgba(0,67,255,0.9)]"
          style={{ backgroundImage: "linear-gradient(90deg, rgba(0,67,255,0) 0%, rgb(0,67,255) 30%, rgb(0,67,255) 70%, rgba(0,67,255,0) 100%)" }}
        />
      </div>
      {srcs.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {srcs.map((_, i) => (
            <span key={i} className={`size-1.5 rounded-full ${i === safeIdx ? "bg-[#0043ff]" : "bg-white/70"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 신청서 추가 마법사 (촬영 → 인식 → 기본정보 → 필요인원 → 등록) ─── */

function extractErrorDetail(message: string): string {
  const jsonStart = message.indexOf("{");
  if (jsonStart === -1) return message;
  try {
    const parsed = JSON.parse(message.slice(jsonStart));
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    /* JSON이 아니면 원문 그대로 표시 */
  }
  return message;
}

function pickCreatedApp(result: unknown, rows: Application[]): Application | null {
  if (result && typeof result === "object" && typeof (result as { id?: unknown }).id === "number") {
    const match = rows.find((a) => a.id === (result as { id: number }).id);
    if (match) return match;
  }
  if (rows.length === 0) return null;
  return rows.reduce((max, a) => (a.id > max.id ? a : max), rows[0]);
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label className="text-sm font-semibold text-[#4b5563]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[52px] w-full rounded-xl bg-white px-4 text-xl font-semibold text-[#475569] outline-none"
      />
    </div>
  );
}

type WizardStep = "photo" | "scanning" | "info" | "items" | "submitting";

function AddApplicationWizard({ initialFiles, onClose, onDone }: {
  initialFiles: File[]; onClose: () => void; onDone: () => void;
}) {
  const [step, setStep] = useState<WizardStep>("photo");
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [previews, setPreviews] = useState<string[]>(() => initialFiles.map((f) => URL.createObjectURL(f)));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [appId, setAppId] = useState<number | null>(null);
  const [신청부서, set신청부서] = useState("");
  const [신청번호, set신청번호] = useState("");
  const [신청자, set신청자] = useState("");
  const [연락처, set연락처] = useState("");
  const [신청일자, set신청일자] = useState("");
  const [items, setItems] = useState<ApplicationItem[]>([]);

  function handleFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
    setPreviews((prev) => [...prev, ...picked.map((f) => URL.createObjectURL(f))]);
  }

  function removePhoto(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function startRecognition() {
    if (files.length === 0) return;
    setStep("scanning");
    setError(null);
    try {
      const merged = await mergeImagesVertically(files);
      const result = await createApplicationFromOcr(merged);
      const rows = await listApplications();
      const created = pickCreatedApp(result, Array.isArray(rows) ? rows : []);
      if (!created) throw new Error("등록된 신청서를 찾을 수 없습니다.");
      setAppId(created.id);
      set신청부서(created.신청부서 ?? "");
      set신청번호(created.신청번호 ?? "");
      set신청자(created.신청자 ?? "");
      set연락처(created.연락처 ?? "");
      set신청일자(created.신청일자 ?? "");
      setItems(created.물품목록 ?? []);
      setStep("info");
    } catch (e) {
      setError(String(e));
      setStep("photo");
    }
  }

  function updateItemCount(idx: number, delta: number) {
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, 필요인원수: Math.max(1, (it.필요인원수 ?? 1) + delta) } : it
    ));
  }

  async function submit() {
    if (appId == null) return;
    setStep("submitting");
    setError(null);
    try {
      await updateApplication(appId, { 신청부서, 신청번호, 신청자, 연락처, 신청일자, 물품목록: items, 점검완료: true });
      onDone();
    } catch (e) {
      setError(String(e));
      setStep("items");
    }
  }

  return (
    <div className="font-pretendard fixed inset-0 z-50 flex flex-col bg-[#ebf4ff]">
      <div className="flex h-14 items-center px-2 pt-safe-top">
        <button onClick={onClose} aria-label="닫기" className="flex size-10 items-center justify-center">
          <ArrowLeft size={24} className="text-[#1e293b]" />
        </button>
      </div>

      {step === "photo" && error && (
        <div className="mx-5 mb-2 rounded-xl bg-[#fef2f2] px-4 py-3 text-sm font-semibold text-[#dc2626]">
          {extractErrorDetail(error)}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-5 pb-4">
        {step === "photo" && (
          <>
            <div className="flex flex-col gap-4">
              <h2 className="text-[28px] font-bold leading-tight text-[#1e293b]">신청서를 촬영해주세요</h2>
              <p className="text-lg font-bold text-[#1e293b]">한 신청번호에 대한 사진들만 올려주세요</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="relative aspect-square overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`신청서 사진 ${i + 1}`} className="size-full object-cover" />
                  <button
                    onClick={() => removePhoto(i)}
                    aria-label="사진 삭제"
                    className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-[#93c5fd] bg-white"
              >
                <Plus size={32} className="text-[#60a5fa]" />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFilesPicked}
            />
          </>
        )}

        {step === "scanning" && previews.length > 0 && (
          <>
            <h2 className="text-[28px] font-bold text-[#1e293b]">신청서 정보를 가져오고 있어요</h2>
            <ScanFrame srcs={previews} />
          </>
        )}

        {step === "info" && (
          <>
            <div className="flex flex-col">
              <h2 className="text-[28px] font-bold leading-tight text-[#1e293b]">인식 완료!</h2>
              <h2 className="text-[28px] font-bold leading-tight text-[#1e293b]">기본 정보를 확인해주세요</h2>
            </div>
            <div className="flex flex-col gap-4">
              <Field label="신청부서" value={신청부서} onChange={set신청부서} />
              <Field label="신청번호" value={신청번호} onChange={set신청번호} />
              <Field label="신청자" value={신청자} onChange={set신청자} />
              <Field label="연락처" value={연락처} onChange={set연락처} />
              <Field label="신청일" value={신청일자} onChange={set신청일자} type="date" />
            </div>
          </>
        )}

        {step === "items" && (
          <>
            <h2 className="text-[28px] font-bold text-[#1e293b]">필요인원을 확인해주세요</h2>
            <div className="flex flex-col gap-3">
              {items.length === 0 && <p className="text-sm text-[#64748b]">인식된 품목이 없습니다.</p>}
              {items.map((it, i) => (
                <div key={i} className="flex h-14 items-center justify-between rounded-xl bg-white px-4">
                  <p className="truncate text-xl font-semibold text-[#475569]">{it.품명}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => updateItemCount(i, -1)}
                      className="flex size-9 items-center justify-center rounded-full bg-[#f1f5f9] text-2xl font-bold text-[#475569]"
                    >
                      −
                    </button>
                    <div className="flex h-9 w-11 items-center justify-center rounded-lg bg-[#f1f5f9] text-xl font-bold text-[#475569]">
                      {it.필요인원수 ?? 1}
                    </div>
                    <button
                      onClick={() => updateItemCount(i, 1)}
                      className="flex size-9 items-center justify-center rounded-full bg-[#f1f5f9] text-2xl font-bold text-[#475569]"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-[#dc2626]">{error}</p>}
          </>
        )}

        {step === "submitting" && (
          <h2 className="text-[28px] font-bold text-[#1e293b]">신청서를 등록중이에요</h2>
        )}
      </div>

      <div className="px-5 pb-11 pt-2">
        {step === "photo" && (
          <button
            onClick={startRecognition}
            disabled={files.length === 0}
            className="flex h-[53px] w-full items-center justify-center gap-2 rounded-xl bg-[#0043ff] text-lg font-semibold text-white disabled:bg-[#d0ddef] disabled:text-[#6b7fa0]"
          >
            <ScanLine size={22} />
            신청서 {files.length}장 인식 시작
          </button>
        )}
        {step === "scanning" && (
          <div className="flex h-[53px] w-full items-center justify-center rounded-xl bg-[#d0ddef] text-lg font-semibold text-[#6b7fa0]">
            정보 가져오는 중...
          </div>
        )}
        {step === "info" && (
          <button
            onClick={() => setStep("items")}
            className="flex h-[53px] w-full items-center justify-center rounded-xl bg-[#0043ff] text-lg font-semibold text-white"
          >
            다음
          </button>
        )}
        {step === "items" && (
          <button
            onClick={submit}
            className="flex h-[53px] w-full items-center justify-center rounded-xl bg-[#0043ff] text-lg font-semibold text-white"
          >
            확인 완료
          </button>
        )}
        {step === "submitting" && (
          <div className="flex h-[53px] w-full items-center justify-center rounded-xl bg-[#d0ddef] text-lg font-semibold text-[#6b7fa0]">
            신청서 등록중...
          </div>
        )}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("신청일순");
  const [includeCompleted, setIncludeCompleted] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  function handleAddFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setPendingFiles(picked);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listApplications();
      setApps(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    let list = includeCompleted ? apps : apps.filter((a) => !isCompleted(a));
    list = [...list].sort((a, b) => {
      if (sort === "신청일순") return (b.신청일자 ?? "").localeCompare(a.신청일자 ?? "");
      return (a.출동일시 ?? "9999").localeCompare(b.출동일시 ?? "9999");
    });
    return list;
  }, [apps, includeCompleted, sort]);

  async function handleOptimize() {
    setOptimizing(true);
    setError(null);
    try {
      await optimizeRun();
      await load();
    } catch (e) {
      const msg = String(e);
      setError(
        msg.includes("최적화할") && msg.includes("신청서가 없습니다")
          ? "최적화할 신청서가 없어요. 점검완료된 미처리 신청서가 있어야 최적화할 수 있어요."
          : msg
      );
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col bg-[#f2f4f7] pb-[calc(80px+env(safe-area-inset-bottom))]">
      <header className="flex h-20 items-center justify-between px-5 pt-safe-top">
        <h1 className="text-2xl font-extrabold text-[#111827]">신청서</h1>
        <div className="flex items-center rounded-full bg-white p-0.5">
          {(["신청일순", "출동일순"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors ${
                sort === k ? "bg-[#475569] text-white" : "text-[#6b7280]"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        <button
          onClick={() => setIncludeCompleted((v) => !v)}
          className="flex items-center gap-1.5 self-start"
        >
          <span
            className={`flex size-4 items-center justify-center rounded-[3px] border-[1.5px] text-[11px] font-bold ${
              includeCompleted ? "border-[#3366e5] bg-white text-[#3366e5]" : "border-[#94a3b2] bg-white text-transparent"
            }`}
          >
            ✓
          </span>
          <span className="text-[13px] font-bold text-[#3e3e3e]">수거완료건 포함</span>
        </button>

        {loading && <p className="mt-16 text-center text-sm text-[#94a3b8]">불러오는 중…</p>}
        {error && (
          <div className="rounded-xl bg-white p-4">
            <p className="mb-2 text-sm font-bold text-[#dc2626]">오류가 발생했어요</p>
            <pre className="whitespace-pre-wrap break-all text-xs text-[#64748b]">{error}</pre>
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <p className="mt-16 text-center text-sm text-[#94a3b8]">표시할 신청서가 없습니다.</p>
        )}
        {visible.map((app) => (
          <OverviewCard key={app.id ?? app.신청번호} app={app} />
        ))}
      </div>

      <button
        onClick={handleOptimize}
        disabled={optimizing}
        aria-label="최적화"
        className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] left-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#475569] text-white shadow-lg disabled:opacity-60"
      >
        {optimizing ? (
          <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <Sparkles size={22} />
        )}
      </button>

      <input
        ref={addInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleAddFilesPicked}
      />
      <button
        onClick={() => addInputRef.current?.click()}
        aria-label="신청서 추가"
        className="fixed bottom-[calc(104px+env(safe-area-inset-bottom))] right-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#0043ff] text-white shadow-lg"
      >
        <Plus size={24} />
      </button>

      {pendingFiles && (
        <AddApplicationWizard
          initialFiles={pendingFiles}
          onClose={() => setPendingFiles(null)}
          onDone={() => { setPendingFiles(null); load(); }}
        />
      )}

      <TabBar />
    </div>
  );
}
