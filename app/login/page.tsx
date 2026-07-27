"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const CODE_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("123456");
  const [submitting, setSubmitting] = useState(false);

  const ready = code.length === CODE_LENGTH && !submitting;

  function handleSubmit() {
    if (!ready) return;
    setSubmitting(true);
    localStorage.setItem("gwanzae-entry-code", code);
    router.push("/today");
  }

  return (
    <div className="font-pretendard min-h-dvh flex flex-col items-center justify-end gap-[89px] bg-[#ebf4ff] pb-11">
      <div className="flex w-full flex-col items-center justify-end pt-[120px]">
        <div className="flex flex-col items-center gap-1.5">
          <Image src="/icons/logo.svg" alt="이지픽업" width={64} height={51} priority />
          <p className="font-extrabold text-2xl text-[#0043ff]">이지픽업</p>
          <p className="bg-gradient-to-r from-[#9ca3af] to-[#0043ff] bg-clip-text text-xl text-transparent">
            신청서 관리부터 수거까지 손쉽게
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-start gap-4 px-8 pt-[60px]">
        <div className="flex w-full flex-col items-start gap-2">
          <label htmlFor="entry-code" className="text-sm font-semibold text-[#4b5563]">
            입장코드
          </label>
          <input
            id="entry-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, CODE_LENGTH))}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="코드 6자리를 입력하세요"
            inputMode="text"
            autoComplete="off"
            className="h-[52px] w-full rounded-xl bg-white px-4 text-base text-[#111827] placeholder:text-[#9ca3af] outline-none"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!ready}
          className={`w-full rounded-xl px-6 py-4 text-lg font-semibold transition-colors ${
            ready ? "bg-[#0043ff] text-white" : "bg-[#d0ddef] text-[#6b7fa0]"
          }`}
        >
          입장하기
        </button>
      </div>
    </div>
  );
}
