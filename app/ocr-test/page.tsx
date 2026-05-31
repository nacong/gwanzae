"use client";

import { useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import {
  Camera, FileText, Loader2, X, ClipboardCopy, Check,
  ChevronDown, ScanLine, Timer, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Lang = "kor" | "kor+eng" | "eng";
type Status = "idle" | "loading" | "done" | "error";

interface OcrResult {
  text: string;
  confidence: number;
  elapsedMs: number;
}

const LANG_LABELS: Record<Lang, string> = {
  kor: "한국어",
  "kor+eng": "한국어 + 영어",
  eng: "영어",
};

export default function OcrTestPage() {
  const [lang, setLang] = useState<Lang>("kor");
  const [langOpen, setLangOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [results, setResults] = useState<OcrResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    setSelectedFiles(prev => [...prev, ...files]);
    // 미리보기 URL 생성
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      setPreviews(prev => [...prev, url]);
    });
    setResults([]);
    setError(null);
    setStatus("idle");
  };

  const removeFile = (i: number) => {
    setSelectedFiles(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => {
      URL.revokeObjectURL(prev[i]);
      return prev.filter((_, j) => j !== i);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(e.target.files ?? []));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")));
  };

  const runOcr = async () => {
    if (!selectedFiles.length) return;
    setStatus("loading");
    setProgress(0);
    setProgressMsg("언어팩 로드 중...");
    setResults([]);
    setError(null);

    try {
      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setProgress(Math.round(m.progress * 100));
            setProgressMsg(`인식 중... ${Math.round(m.progress * 100)}%`);
          } else if (m.status === "loading tesseract core") {
            setProgressMsg("Tesseract 코어 로드 중...");
          } else if (m.status === "initializing tesseract") {
            setProgressMsg("초기화 중...");
          } else if (m.status === "loading language traineddata") {
            setProgressMsg(`언어 데이터 로드 중 (${lang})...`);
          } else if (m.status === "initializing api") {
            setProgressMsg("API 초기화 중...");
          }
        },
      });

      const ocrResults: OcrResult[] = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        setProgressMsg(`이미지 ${i + 1} / ${selectedFiles.length} 인식 중...`);
        const t0 = performance.now();
        const { data } = await worker.recognize(selectedFiles[i]);
        const elapsedMs = Math.round(performance.now() - t0);
        ocrResults.push({
          text: data.text,
          confidence: Math.round(data.confidence),
          elapsedMs,
        });
      }

      await worker.terminate();
      setResults(ocrResults);
      setStatus("done");
      setProgress(100);
      setProgressMsg("완료");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  };

  const allText = results.map(r => r.text).join("\n\n---\n\n");

  const copyAll = async () => {
    await navigator.clipboard.writeText(allText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const totalMs = results.reduce((a, r) => a + r.elapsedMs, 0);
  const avgConf = results.length
    ? Math.round(results.reduce((a, r) => a + r.confidence, 0) / results.length)
    : 0;

  return (
    <main className="min-h-screen bg-[#f0f2f8] px-4 pt-safe-top pb-10">
      {/* 헤더 */}
      <header className="pt-7 pb-5">
        <p className="text-xs font-semibold text-indigo-400 mb-0.5 tracking-wide">OCR 실험실</p>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">OCR 테스트</h1>
        <p className="mt-1 text-xs text-slate-400">
          Tesseract.js 기반 · 브라우저에서 실행 · 서버 전송 없음
        </p>
      </header>

      {/* 언어 선택 */}
      <div className="bg-white rounded-2xl p-4 mb-4 relative">
        <span className="text-xs font-semibold text-slate-500 mb-2 block">인식 언어</span>
        <button
          onClick={() => setLangOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 bg-slate-50 active:bg-slate-100 transition-colors"
        >
          {LANG_LABELS[lang]}
          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", langOpen && "rotate-180")} />
        </button>
        {langOpen && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
            {(Object.keys(LANG_LABELS) as Lang[]).map(l => (
              <button
                key={l}
                onClick={() => { setLang(l); setLangOpen(false); setResults([]); setStatus("idle"); }}
                className={cn(
                  "w-full text-left px-4 py-3 text-sm font-semibold transition-colors",
                  l === lang ? "bg-indigo-50 text-indigo-600" : "text-slate-700 hover:bg-slate-50"
                )}
              >
                {LANG_LABELS[l]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 파일 업로드 */}
      <div
        className="bg-white rounded-2xl p-4 mb-4"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <span className="text-xs font-semibold text-slate-500 mb-3 block">이미지 선택</span>

        {/* 드래그앤드롭 영역 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-indigo-200 rounded-2xl py-6 flex flex-col items-center gap-2 bg-indigo-50/50 active:bg-indigo-50 transition-colors mb-3"
        >
          <Camera className="w-7 h-7 text-indigo-300" />
          <span className="text-sm font-semibold text-indigo-400">
            사진 촬영 / 파일 선택
          </span>
          <span className="text-xs text-slate-400">또는 여기로 드래그</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 선택된 파일 목록 + 미리보기 */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            {selectedFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2">
                {/* 썸네일 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[i]}
                  alt={file.name}
                  className="w-10 h-10 object-cover rounded-lg border border-slate-200 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  onClick={() => removeFile(i)}
                  className="p-1.5 rounded-full hover:bg-slate-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* 실행 버튼 */}
      <button
        onClick={runOcr}
        disabled={!selectedFiles.length || status === "loading"}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-sm transition-all mb-6",
          selectedFiles.length && status !== "loading"
            ? "bg-indigo-600 text-white active:bg-indigo-700"
            : "bg-slate-200 text-slate-400"
        )}
      >
        {status === "loading" ? (
          <><Loader2 className="w-4 h-4 animate-spin" />{progressMsg}</>
        ) : (
          <><ScanLine className="w-4 h-4" />OCR 실행</>
        )}
      </button>

      {/* 진행 바 */}
      {status === "loading" && (
        <div className="bg-white rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-600">{progressMsg}</span>
            <span className="text-xs font-bold text-indigo-500">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 결과 */}
      {status === "done" && results.length > 0 && (
        <div className="space-y-4">

          {/* 요약 통계 */}
          <div className="bg-white rounded-2xl p-4 flex gap-4">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                <Timer className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">소요 시간</span>
              </div>
              <p className="text-xl font-black text-slate-800">
                {totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`}
              </p>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                <ScanLine className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">신뢰도</span>
              </div>
              <p className={cn(
                "text-xl font-black",
                avgConf >= 80 ? "text-emerald-500" : avgConf >= 60 ? "text-amber-500" : "text-red-500"
              )}>
                {avgConf}%
              </p>
            </div>
            <div className="w-px bg-slate-100" />
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 text-slate-400 mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">이미지 수</span>
              </div>
              <p className="text-xl font-black text-slate-800">{results.length}장</p>
            </div>
          </div>

          {/* 이미지별 결과 */}
          {results.map((r, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden">
              {/* 이미지 헤더 */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previews[i]}
                    alt=""
                    className="w-8 h-8 object-cover rounded-lg border border-slate-200"
                  />
                  <div>
                    <p className="text-xs font-bold text-slate-800">{selectedFiles[i]?.name}</p>
                    <p className="text-[11px] text-slate-400">
                      신뢰도 {r.confidence}% · {r.elapsedMs >= 1000 ? `${(r.elapsedMs / 1000).toFixed(1)}s` : `${r.elapsedMs}ms`}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  "text-[11px] font-bold px-2 py-1 rounded-lg",
                  r.confidence >= 80 ? "bg-emerald-50 text-emerald-600"
                    : r.confidence >= 60 ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-500"
                )}>
                  {r.confidence >= 80 ? "양호" : r.confidence >= 60 ? "보통" : "불량"}
                </span>
              </div>

              {/* OCR 텍스트 */}
              <div className="p-4">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono leading-relaxed bg-slate-50 rounded-xl p-3 max-h-80 overflow-y-auto">
                  {r.text || "(인식된 텍스트 없음)"}
                </pre>
              </div>
            </div>
          ))}

          {/* 전체 텍스트 복사 */}
          {results.length > 1 && (
            <div className="bg-white rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">전체 텍스트 (합본)</span>
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 active:text-indigo-700 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
              <pre className="text-xs text-slate-700 whitespace-pre-wrap break-all font-mono leading-relaxed bg-slate-50 rounded-xl p-3 max-h-60 overflow-y-auto">
                {allText}
              </pre>
            </div>
          )}

          {results.length === 1 && (
            <button
              onClick={copyAll}
              className="w-full flex items-center justify-center gap-2 bg-white rounded-2xl py-3.5 font-bold text-sm text-slate-600 active:bg-slate-50 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <ClipboardCopy className="w-4 h-4 text-indigo-400" />}
              {copied ? "복사됨!" : "텍스트 복사"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
