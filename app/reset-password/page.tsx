"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Eye, EyeOff, X } from "lucide-react";
import { AuthRequestError, resetPasswordAccount } from "@/lib/auth";

type PasswordRules = { length: boolean; letter: boolean; number: boolean };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
    setToken(resetToken || null);
    setTokenChecked(true);
  }, []);

  const passwordRules: PasswordRules = {
    length: password.length >= 8 && password.length <= 128,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);
  const passwordsMatch = password.length > 0 && password === passwordConfirm;
  const ready = Boolean(token) && passwordValid && passwordsMatch && !submitting;

  async function handleSubmit() {
    if (!ready || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      await resetPasswordAccount(token, password);
      setCompleted(true);
    } catch (submitError) {
      setError(resetErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-[#ebf4ff] px-8 py-12">
      <div className="flex w-full max-w-sm flex-col items-center">
        <Image src="/icons/logo.svg" alt="이지픽업" width={64} height={51} priority />
        <p className="mt-1.5 text-2xl font-extrabold text-[#0043ff]">이지픽업</p>

        {completed ? (
          <section className="mt-10 flex w-full flex-col items-center rounded-3xl bg-white p-6 text-center shadow-sm">
            <div className="flex size-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 size={30} className="text-emerald-500" />
            </div>
            <h1 className="mt-5 text-xl font-extrabold text-[#111827]">비밀번호 변경 완료</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
              새 비밀번호가 저장되었습니다.<br />변경한 비밀번호로 로그인해 주세요.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="mt-7 h-[52px] w-full rounded-xl bg-[#0043ff] text-base font-semibold text-white"
            >
              로그인하러 가기
            </button>
          </section>
        ) : (
          <section className="mt-9 flex w-full flex-col items-start gap-5">
            <div>
              <h1 className="text-2xl font-extrabold text-[#111827]">새 비밀번호 설정</h1>
              <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
                앞으로 로그인할 때 사용할 새 비밀번호를 입력해 주세요.
              </p>
            </div>

            {tokenChecked && !token && (
              <div role="alert" className="flex w-full gap-3 rounded-2xl bg-red-50 p-4 text-red-700">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold">재설정 링크를 확인할 수 없습니다.</p>
                  <p className="mt-1 text-xs leading-relaxed">이메일에서 받은 비밀번호 재설정 링크를 다시 열어 주세요.</p>
                </div>
              </div>
            )}

            <PasswordField
              label="새 비밀번호"
              value={password}
              onChange={(value) => setPassword(value.slice(0, 128))}
              autoComplete="new-password"
              rules={passwordRules}
              onEnter={handleSubmit}
            />
            <PasswordField
              label="새 비밀번호 확인"
              value={passwordConfirm}
              onChange={(value) => setPasswordConfirm(value.slice(0, 128))}
              autoComplete="new-password"
              onEnter={handleSubmit}
            />
            {passwordConfirm && !passwordsMatch && (
              <p role="alert" className="-mt-3 text-xs font-semibold text-[#dc2626]">비밀번호가 일치하지 않습니다.</p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!ready}
              className={`h-[52px] w-full rounded-xl text-base font-semibold transition-colors ${
                ready ? "bg-[#0043ff] text-white" : "bg-[#d0ddef] text-[#6b7fa0]"
              }`}
            >
              {submitting ? "변경 중…" : "비밀번호 변경"}
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
        <ErrorDialog
          title="비밀번호를 변경할 수 없습니다"
          message={error}
          onClose={() => setError(null)}
        />
      )}
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, onEnter, rules }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  onEnter: () => void;
  rules?: PasswordRules;
}) {
  const [visible, setVisible] = useState(false);
  const constraints = [
    ["length", "8~128자"] as const,
    ["letter", "영문 포함"] as const,
    ["number", "숫자 포함"] as const,
  ];
  return (
    <div className="flex w-full flex-col items-start gap-2">
      <label className="text-sm font-semibold text-[#4b5563]">{label}</label>
      <div className="relative w-full">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onEnter()}
          autoComplete={autoComplete}
          aria-describedby={rules ? "reset-password-constraints" : undefined}
          className="h-[52px] w-full rounded-xl bg-white px-4 pr-12 text-base text-[#111827] outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-[#64748b]"
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
      {rules && (
        <div id="reset-password-constraints" className="flex flex-wrap gap-x-3 gap-y-1">
          {constraints.map(([key, text]) => {
            const valid = rules[key];
            const color = valid ? "text-[#16a34a]" : value ? "text-[#dc2626]" : "text-[#94a3b8]";
            return (
              <span key={key} className={`flex items-center gap-1 text-[11px] font-semibold ${color}`}>
                {valid ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                {text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ErrorDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="reset-error-title"
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
        <h2 id="reset-error-title" className="mt-4 text-xl font-extrabold text-[#111827]">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#64748b]">{message}</p>
        <button type="button" onClick={onClose} className="mt-6 h-[50px] w-full rounded-xl bg-[#0043ff] text-base font-semibold text-white">
          다시 확인하기
        </button>
      </div>
    </div>
  );
}

function resetErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 400) return "재설정 링크가 유효하지 않거나 만료되었습니다. 새 링크를 요청해 주세요.";
    if (error.status === 422) return error.message.replaceAll("Value error, ", "");
    if (error.status >= 500) return "서버에서 비밀번호 변경을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return error.message;
  }
  if (error instanceof TypeError) {
    return "로그인 서버에 연결할 수 없습니다. 네트워크 연결과 서버 실행 상태를 확인해 주세요.";
  }
  return error instanceof Error ? error.message : "알 수 없는 오류로 비밀번호를 변경하지 못했습니다.";
}
