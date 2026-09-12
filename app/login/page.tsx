"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Building2, CheckCircle2, ChevronRight,
  Circle, Eye, EyeOff, UserRound, X,
} from "lucide-react";
import { AuthRequestError, loginAccount, saveAuth, signupAccount } from "@/lib/auth";

type View = "login" | "choice" | "name" | "email" | "password" | "organization";
type OrganizationMode = "create" | "join";
const SIGNUP_STEPS: View[] = ["name", "email", "password", "organization"];

export default function LoginPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("login");
  const [organizationMode, setOrganizationMode] = useState<OrganizationMode>("join");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
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
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const usernameValid = username.trim().length >= 4;
  const stepIndex = SIGNUP_STEPS.indexOf(view);
  const loginReady = usernameValid && passwordValid && !submitting;
  const stepReady = view === "name" ? Boolean(fullName.trim()) && usernameValid
    : view === "email" ? emailValid
      : view === "password" ? passwordValid
        : view === "organization"
          ? organizationMode === "create" ? Boolean(organizationName.trim()) : entryCode.length === 6
          : false;

  async function handleLogin() {
    if (!loginReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await loginAccount(username.trim(), password);
      saveAuth(result);
      router.replace(result.user.role === "admin" ? "/admin" : "/today");
    } catch (submitError) {
      setError(loginErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function nextSignupStep() {
    if (!stepReady) return;
    if (view !== "organization") {
      setView(SIGNUP_STEPS[stepIndex + 1]);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signupAccount({
        username: username.trim(), password, full_name: fullName.trim(), email: email.trim(),
        organization_mode: organizationMode,
        organization_name: organizationMode === "create" ? organizationName.trim() : undefined,
        entry_code: organizationMode === "join" ? entryCode : undefined,
      });
      const result = await loginAccount(username.trim(), password);
      saveAuth(result);
      router.replace(result.user.role === "admin" ? "/admin" : "/today");
    } catch (submitError) {
      setError(loginErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setError(null);
    if (view === "choice") setView("login");
    else if (stepIndex === 0) setView("choice");
    else if (stepIndex > 0) setView(SIGNUP_STEPS[stepIndex - 1]);
  }

  if (view === "choice") {
    return (
      <AuthShell>
        <button type="button" onClick={goBack} aria-label="로그인으로 돌아가기" className="absolute left-5 top-[calc(env(safe-area-inset-top,0px)+20px)] flex size-10 items-center justify-center text-[#1f2937]">
          <ArrowLeft size={22} />
        </button>
        <main className="flex flex-1 flex-col px-6 pt-[18vh]">
          <h1 className="text-2xl font-extrabold text-[#1f2937]">어떻게 시작할까요?</h1>
          <div className="mt-[17vh] flex flex-col gap-4">
            <ChoiceCard active icon={UserRound} title="팀에 합류하기" description="초대받은 코드로 바로 참여해요" onClick={() => { setOrganizationMode("join"); setView("name"); }} />
            <ChoiceCard icon={Building2} title="새 조직 만들기" description="우리 팀만의 공간을 시작해요" onClick={() => { setOrganizationMode("create"); setView("name"); }} />
          </div>
        </main>
      </AuthShell>
    );
  }

  if (stepIndex >= 0) {
    const heading = view === "name" ? "사용할 이름을 알려주세요"
      : view === "email" ? "이메일을 입력해 주세요"
        : view === "password" ? "비밀번호를 만들어 주세요"
          : organizationMode === "join" ? "입장 코드를 입력해 주세요" : "조직 이름을 정해 주세요";
    return (
      <AuthShell>
        <header className="flex h-14 items-center px-4 pt-safe-top">
          <button type="button" onClick={goBack} aria-label="이전 단계" className="flex size-10 items-center justify-center text-[#1f2937]"><ArrowLeft size={22} /></button>
        </header>
        <main className="flex flex-1 flex-col px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-5">
          <div className="w-fit rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[#4b5563]">{stepIndex + 1} / 4</div>
          <h1 className="mt-5 text-[26px] font-extrabold leading-tight text-[#1f2937]">{heading}</h1>
          <div className="mt-6 flex flex-col gap-4">
            {view === "name" && (
              <>
                <Field label="이름" value={fullName} onChange={(value) => setFullName(value.slice(0, 100))} placeholder="이름" autoComplete="name" />
                <Field label="아이디" value={username} onChange={(value) => setUsername(value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50))} placeholder="4자 이상 입력" autoComplete="username" />
              </>
            )}
            {view === "email" && <Field label="이메일" type="email" value={email} onChange={(value) => setEmail(value.slice(0, 255))} placeholder="name@example.com" autoComplete="email" />}
            {view === "password" && <PasswordField value={password} onChange={(value) => setPassword(value.slice(0, 128))} rules={passwordRules} onEnter={nextSignupStep} />}
            {view === "organization" && organizationMode === "join" && (
              <Field label="입장 코드" value={entryCode} onChange={(value) => setEntryCode(value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 6))} placeholder="코드 6자리" autoComplete="off" onEnter={nextSignupStep} />
            )}
            {view === "organization" && organizationMode === "create" && (
              <Field label="조직 이름" value={organizationName} onChange={(value) => setOrganizationName(value.slice(0, 100))} placeholder="조직 이름" autoComplete="organization" onEnter={nextSignupStep} />
            )}
          </div>
          <button type="button" onClick={nextSignupStep} disabled={!stepReady || submitting} className="primary-button mt-auto flex w-full items-center justify-center">
            {submitting ? "가입 중…" : view === "organization" ? organizationMode === "join" ? "가입하기" : "조직 만들기" : "다음"}
          </button>
        </main>
        {error && <AuthErrorDialog title="계정을 만들 수 없습니다" message={error} onClose={() => setError(null)} />}
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <main className="flex flex-1 flex-col justify-center px-8 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-16">
        <div className="flex flex-col items-center">
          <Image src="/icons/logo.svg" alt="이지픽업" width={64} height={51} priority />
          <p className="mt-1.5 text-2xl font-extrabold text-[#0043ff]">이지픽업</p>
          <p className="mt-1 text-[15px] font-medium text-[#6b7fa0]">신청서 관리부터 수거까지 손쉽게</p>
        </div>
        <div className="mt-14 flex flex-col gap-4">
          <Field label="아이디" value={username} onChange={(value) => setUsername(value.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 50))} placeholder="아이디를 입력하세요" autoComplete="username" />
          <PasswordField value={password} onChange={(value) => setPassword(value.slice(0, 128))} rules={passwordRules} onEnter={handleLogin} compact />
          <button type="button" onClick={() => router.push("/forgot-password")} className="-mt-1 self-end text-sm font-semibold text-[#0043ff]">비밀번호를 잊으셨나요?</button>
          <button type="button" onClick={handleLogin} disabled={!loginReady} className="primary-button mt-2 flex w-full items-center justify-center">{submitting ? "확인 중…" : "로그인"}</button>
          <button type="button" onClick={() => { setView("choice"); setError(null); }} className="w-full py-2 text-center text-sm font-semibold text-[#5b6f91]">계정이 없나요? <span className="text-[#0043ff]">시작하기</span></button>
        </div>
      </main>
      {error && <AuthErrorDialog title="로그인할 수 없습니다" message={error} onClose={() => setError(null)} />}
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="app-screen font-pretendard relative flex min-h-dvh flex-col overflow-y-auto">{children}</div>;
}

function ChoiceCard({ active = false, icon: Icon, title, description, onClick }: {
  active?: boolean; icon: typeof UserRound; title: string; description: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-4 rounded-2xl border bg-white p-6 text-left shadow-[0_4px_8px_rgba(31,41,55,0.03)] ${active ? "border-2 border-[#0043ff]" : "border-[#e5e7eb]"}`}>
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${active ? "bg-[#ebf4ff] text-[#0043ff]" : "bg-[#f3f4f6] text-[#6b7280]"}`}><Icon size={24} /></span>
      <span className="min-w-0 flex-1"><strong className="block text-lg text-[#1f2937]">{title}</strong><small className="mt-1 block text-[13px] text-[#4b5563]">{description}</small></span>
      <ChevronRight size={20} className="shrink-0 text-[#6b7280]" />
    </button>
  );
}

type PasswordRules = { length: boolean; letter: boolean; number: boolean };
function PasswordField({ value, onChange, onEnter, rules, compact = false }: {
  value: string; onChange: (value: string) => void; onEnter: () => void; rules: PasswordRules; compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const constraints = [["length", "8~128자"], ["letter", "영문 포함"], ["number", "숫자 포함"]] as const;
  return (
    <div className="flex w-full flex-col gap-2">
      <label className="text-sm font-semibold text-[#4b5563]">비밀번호</label>
      <div className="relative">
        <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onEnter()} autoComplete={compact ? "current-password" : "new-password"} placeholder="비밀번호를 입력하세요" className="field-input pr-12" />
        <button type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-[#9ca3af]">{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {constraints.map(([key, text]) => {
            const valid = rules[key];
            return <span key={key} className={`flex items-center gap-1 text-[11px] font-semibold ${valid ? "text-emerald-600" : value ? "text-red-500" : "text-[#9ca3af]"}`}>{valid ? <CheckCircle2 size={12} /> : <Circle size={12} />}{text}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, autoComplete, onEnter }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; autoComplete?: string; onEnter?: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <label className="text-sm font-semibold text-[#4b5563]">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onEnter?.()} placeholder={placeholder} autoComplete={autoComplete} className="field-input" />
    </div>
  );
}

function AuthErrorDialog({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between"><span className="flex size-10 items-center justify-center rounded-full bg-red-50"><AlertCircle size={22} className="text-red-500" /></span><button type="button" onClick={onClose} aria-label="닫기" className="flex size-8 items-center justify-center text-[#64748b]"><X size={20} /></button></div>
        <h2 className="mt-4 text-xl font-extrabold text-[#1f2937]">{title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#64748b]">{message}</p>
        <button type="button" onClick={onClose} className="primary-button mt-6 w-full">다시 확인하기</button>
      </div>
    </div>
  );
}

function loginErrorMessage(error: unknown): string {
  if (error instanceof AuthRequestError) {
    if (error.status === 401 && /아이디|비밀번호/.test(error.message)) return "아이디 또는 비밀번호가 일치하지 않습니다. 입력한 내용을 다시 확인해 주세요.";
    if (error.status === 422) return error.message.replaceAll("Value error, ", "");
    if (error.status >= 500) return `서버에서 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.\n${error.message}`;
    return error.message;
  }
  if (error instanceof TypeError) return "로그인 서버에 연결할 수 없습니다. 네트워크 연결과 서버 실행 상태를 확인해 주세요.";
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
