"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AlertCircle, CheckCircle2, Circle, Eye, EyeOff, X } from "lucide-react";
import { AuthRequestError, loginAccount, saveAuth, signupAccount } from "@/lib/auth";

type Mode = "login" | "signup";
type OrganizationMode = "create" | "join";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationMode, setOrganizationMode] = useState<OrganizationMode>("join");
  const [organizationName, setOrganizationName] = useState("");
  const [entryCode, setEntryCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRules = {
    length: password.length >= 8 && password.length <= 128,
    letter: /[A-Za-z]/.test(password),
    number: /\d/.test(password),
  };
  const passwordValid = Object.values(passwordRules).every(Boolean);

  const ready = username.trim().length >= 4
    && passwordValid
    && (mode === "login" || (
      !!fullName.trim()
      && !!email.trim()
      && (organizationMode === "create" ? !!organizationName.trim() : entryCode.length === 6)
    ))
    && !submitting;

  async function handleSubmit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signupAccount({
          username: username.trim(),
          password,
          full_name: fullName.trim(),
          email: email.trim(),
          organization_mode: organizationMode,
          organization_name: organizationMode === "create" ? organizationName.trim() : undefined,
          entry_code: organizationMode === "join" ? entryCode : undefined,
        });
      }
      const result = await loginAccount(username.trim(), password);
      saveAuth(result);
      router.replace(result.user.role === "admin" ? "/admin" : "/today");
    } catch (submitError) {
      setError(loginErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="font-pretendard flex min-h-dvh flex-col items-center justify-end gap-10 overflow-y-auto bg-[#ebf4ff] pb-11">
      <div className="flex w-full flex-col items-center justify-end pt-[72px]">
        <div className="flex flex-col items-center gap-1.5">
          <Image src="/icons/logo.svg" alt="이지픽업" width={64} height={51} priority />
          <p className="text-2xl font-extrabold text-[#0043ff]">이지픽업</p>
          <p className="bg-gradient-to-r from-[#9ca3af] to-[#0043ff] bg-clip-text text-xl text-transparent">
            신청서 관리부터 수거까지 손쉽게
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-start gap-4 px-8">
        {mode === "signup" && (
          <>
            <div className="flex w-full gap-3">
              <Field label="이름" value={fullName} onChange={setFullName} autoComplete="name" />
              <Field label="이메일" value={email} onChange={setEmail} type="email" autoComplete="email" />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 rounded-xl bg-white/60 p-1.5">
              <button
                type="button"
                onClick={() => setOrganizationMode("join")}
                className={`h-10 rounded-lg text-sm font-bold ${organizationMode === "join" ? "bg-[#0043ff] text-white" : "text-[#64748b]"}`}
              >
                입장 코드로 참여
              </button>
              <button
                type="button"
                onClick={() => setOrganizationMode("create")}
                className={`h-10 rounded-lg text-sm font-bold ${organizationMode === "create" ? "bg-[#0043ff] text-white" : "text-[#64748b]"}`}
              >
                조직 만들기
              </button>
            </div>
            {organizationMode === "create" ? (
              <Field
                label="조직 이름"
                value={organizationName}
                onChange={(value) => setOrganizationName(value.slice(0, 100))}
                autoComplete="organization"
              />
            ) : (
              <Field
                label="입장 코드"
                value={entryCode}
                onChange={(value) => setEntryCode(value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 6))}
                autoComplete="off"
                onEnter={handleSubmit}
              />
            )}
          </>
        )}
        <Field
          label="아이디"
          value={username}
          onChange={(value) => setUsername(value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50))}
          autoComplete="username"
          onEnter={handleSubmit}
        />
        <PasswordField
          label="비밀번호"
          value={password}
          onChange={(value) => setPassword(value.slice(0, 128))}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onEnter={handleSubmit}
          rules={passwordRules}
        />

        {mode === "login" && (
          <button
            type="button"
            onClick={() => router.push("/forgot-password")}
            className="-mt-2 self-end text-sm font-semibold text-[#0043ff]"
          >
            비밀번호를 잊으셨나요?
          </button>
        )}

        <button
          onClick={handleSubmit}
          disabled={!ready}
          className={`w-full rounded-xl px-6 py-4 text-lg font-semibold transition-colors ${
            ready ? "bg-[#0043ff] text-white" : "bg-[#d0ddef] text-[#6b7fa0]"
          }`}
        >
          {submitting ? "확인 중…" : mode === "login" ? "로그인" : "계정 만들고 로그인"}
        </button>
        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
          className="w-full text-center text-sm font-semibold text-[#5b6f91]"
        >
          {mode === "login" ? "계정이 없나요? 계정 만들기" : "이미 계정이 있나요? 로그인"}
        </button>
      </div>

      {error && (
        <AuthErrorDialog
          title={mode === "login" ? "로그인할 수 없습니다" : "계정을 만들 수 없습니다"}
          message={error}
          onClose={() => setError(null)}
        />
      )}
    </div>
  );
}

type PasswordRules = { length: boolean; letter: boolean; number: boolean };

function PasswordField({ label, value, onChange, autoComplete, onEnter, rules }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  onEnter?: () => void;
  rules: PasswordRules;
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
          onKeyDown={(event) => event.key === "Enter" && onEnter?.()}
          autoComplete={autoComplete}
          aria-describedby="password-constraints"
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
      <div id="password-constraints" className="flex flex-wrap gap-x-3 gap-y-1">
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
    </div>
  );
}

function AuthErrorDialog({ title, message, onClose }: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="auth-error-title"
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
        <h2 id="auth-error-title" className="mt-4 text-xl font-extrabold text-[#111827]">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#64748b]">{message}</p>
        <button type="button" onClick={onClose} className="mt-6 h-[50px] w-full rounded-xl bg-[#0043ff] text-base font-semibold text-white">
          다시 확인하기
        </button>
      </div>
    </div>
  );
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 401 && /아이디|비밀번호/.test(error.message)) {
      return "아이디 또는 비밀번호가 일치하지 않습니다. 입력한 내용을 다시 확인해 주세요.";
    }
    if (error.status === 409) return error.message;
    if (error.status === 422) return error.message.replaceAll("Value error, ", "");
    if (error.status >= 500) return `서버에서 로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.\n${error.message}`;
    return error.message;
  }
  if (error instanceof TypeError) {
    return "로그인 서버에 연결할 수 없습니다. 네트워크 연결과 서버 실행 상태를 확인해 주세요.";
  }
  return error instanceof Error ? error.message : "알 수 없는 오류로 로그인하지 못했습니다.";
}

function Field({ label, value, onChange, type = "text", autoComplete, onEnter }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  onEnter?: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
      <label className="text-sm font-semibold text-[#4b5563]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && onEnter?.()}
        autoComplete={autoComplete}
        className="h-[52px] w-full rounded-xl bg-white px-4 text-base text-[#111827] outline-none"
      />
    </div>
  );
}
