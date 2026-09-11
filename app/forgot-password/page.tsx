"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, Mail, X } from "lucide-react";
import { AuthRequestError, requestPasswordReset } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const ready = emailValid && !submitting;

  async function handleSubmit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await requestPasswordReset(normalizedEmail);
      if (result.reset_token) {
        router.replace(`/reset-password?token=${encodeURIComponent(result.reset_token)}`);
        return;
      }
      setSent(true);
    } catch (submitError) {
      setError(forgotPasswordErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-[#ebf4ff] px-8 py-12">
      <div className="flex w-full max-w-sm flex-col items-center">
        <Image src="/icons/logo.svg" alt="이지픽업" width={64} height={51} priority />
        <p className="mt-1.5 text-2xl font-extrabold text-[#0043ff]">이지픽업</p>

        {sent ? (
          <section className="mt-10 flex w-full flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 size={30} className="text-emerald-500" />
            </div>
            <h1 className="mt-5 text-xl font-extrabold text-[#111827]">메일을 확인해 주세요</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
              가입된 계정이 있다면 <strong className="font-bold text-[#334155]">{normalizedEmail}</strong>로<br />
              비밀번호 재설정 링크를 보냈습니다.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[#94a3b8]">메일이 보이지 않으면 스팸함도 확인해 주세요.</p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-7 h-[52px] w-full rounded-xl bg-[#0043ff] text-base font-semibold text-white"
            >
              로그인으로 돌아가기
            </button>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-4 text-sm font-semibold text-[#5b6f91]"
            >
              다른 이메일로 다시 요청하기
            </button>
          </section>
        ) : (
          <section className="mt-9 flex w-full flex-col items-start gap-5">
            <div>
              <h1 className="text-2xl font-extrabold text-[#111827]">비밀번호 찾기</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
                가입할 때 사용한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
              </p>
            </div>

            <div className="flex w-full flex-col items-start gap-2">
              <label htmlFor="reset-email" className="text-sm font-semibold text-[#4b5563]">이메일</label>
              <div className="relative w-full">
                <Mail size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.slice(0, 255))}
                  onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
                  autoComplete="email"
                  placeholder="name@example.com"
                  className="h-[52px] w-full rounded-xl bg-white pl-11 pr-4 text-base text-[#111827] outline-none placeholder:text-[#a8b3c5]"
                />
              </div>
              {email && !emailValid && (
                <p role="alert" className="text-xs font-semibold text-[#dc2626]">올바른 이메일 주소를 입력해 주세요.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!ready}
              className={`h-[52px] w-full rounded-xl text-base font-semibold transition-colors ${
                ready ? "bg-[#0043ff] text-white" : "bg-[#d0ddef] text-[#6b7fa0]"
              }`}
            >
              {submitting ? "발송 중…" : "재설정 메일 받기"}
            </button>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="w-full text-center text-sm font-semibold text-[#5b6f91]"
            >
              로그인으로 돌아가기
            </button>
          </section>
        )}
      </div>

      {error && (
        <ErrorDialog message={error} onClose={() => setError(null)} />
      )}
    </div>
  );
}

function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="forgot-error-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={22} className="text-red-500" />
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 items-center justify-center text-[#64748b]">
            <X size={20} />
          </button>
        </div>
        <h2 id="forgot-error-title" className="mt-4 text-xl font-extrabold text-[#111827]">메일을 보낼 수 없습니다</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#64748b]">{message}</p>
        <button type="button" onClick={onClose} className="mt-6 h-[50px] w-full rounded-xl bg-[#0043ff] text-base font-semibold text-white">
          다시 확인하기
        </button>
      </div>
    </div>
  );
}

function forgotPasswordErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 422) return error.message.replaceAll("Value error, ", "");
    if (error.status === 503 && /설정/.test(error.message)) {
      return "비밀번호 재설정 메일 기능이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.";
    }
    if (error.status >= 500) return "메일 발송을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return error.message;
  }
  if (error instanceof TypeError) {
    return "로그인 서버에 연결할 수 없습니다. 네트워크 연결과 서버 실행 상태를 확인해 주세요.";
  }
  return error instanceof Error ? error.message : "알 수 없는 오류로 메일을 보내지 못했습니다.";
}
