"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeyRound, LogOut, Mail, ShieldCheck, UserRound } from "lucide-react";
import TabBar from "@/components/TabBar";
import { AUTH_USER_KEY, clearAuth, type AuthUser } from "@/lib/auth";

export default function ProfilePage() {
  const router = useRouter();
  const userSnapshot = useSyncExternalStore<string | null>(
    () => () => undefined,
    () => sessionStorage.getItem(AUTH_USER_KEY),
    () => null,
  );
  let user: AuthUser | null = null;
  try { user = userSnapshot ? JSON.parse(userSnapshot) as AuthUser : null; } catch { user = null; }

  return (
    <div className="app-screen font-pretendard flex flex-col pb-[calc(80px+env(safe-area-inset-bottom,0px))]">
      <header className="px-6 pb-5 pt-[calc(env(safe-area-inset-top,0px)+28px)]">
        <p className="text-xs font-semibold text-[#9ca3af]">계정</p>
        <h1 className="mt-1 text-2xl font-extrabold text-[#1f2937]">내 정보</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4">
        <section className="surface-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[#ebf4ff] text-[#0043ff]">
              <UserRound size={27} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold text-[#1f2937]">{user?.full_name || "사용자"}</h2>
              <p className="mt-1 text-sm text-[#9ca3af]">{user?.role === "admin" ? "관리자" : "작업자"}</p>
            </div>
          </div>
        </section>

        <section className="surface-card overflow-hidden px-4">
          <InfoRow icon={Mail} label="이메일" value={user?.email || "-"} />
          <InfoRow icon={Building2} label="조직" value={user?.organization_name || "-"} />
          <InfoRow icon={ShieldCheck} label="계정 아이디" value={user?.username || "-"} />
          {user?.organization_entry_code && (
            <InfoRow icon={KeyRound} label="작업자 입장 코드" value={user.organization_entry_code} accent />
          )}
        </section>

        <button
          type="button"
          onClick={() => { clearAuth(); router.replace("/login"); }}
          className="surface-card mt-2 flex h-[54px] items-center justify-center gap-2 font-bold text-[#dc2626]"
        >
          <LogOut size={19} /> 로그아웃
        </button>
      </main>
      <TabBar />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, accent = false }: {
  icon: typeof Mail;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-h-[62px] items-center gap-3 border-b border-[#f3f4f6] py-3 last:border-b-0">
      <Icon size={18} className="shrink-0 text-[#9ca3af]" />
      <span className="text-sm font-medium text-[#4b5563]">{label}</span>
      <span className={`ml-auto max-w-[58%] truncate text-right text-sm font-bold ${accent ? "tracking-[0.15em] text-[#0043ff]" : "text-[#1f2937]"}`}>{value}</span>
    </div>
  );
}
