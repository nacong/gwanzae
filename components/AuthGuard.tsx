"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth, fetchCurrentUser, getStoredToken, saveAuth } from "@/lib/auth";

const PUBLIC_PATHS = new Set(["/", "/login", "/forgot-password", "/reset-password"]);

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.has(pathname);
  const [authorizedPath, setAuthorizedPath] = useState<string | null>(null);

  useEffect(() => {
    if (isPublic) return;

    const token = getStoredToken();
    if (!token) {
      clearAuth();
      router.replace("/login");
      return;
    }

    let active = true;
    fetchCurrentUser(token).then((user) => {
      if (!active) return;
      saveAuth({ access_token: token, token_type: "bearer", expires_in: 0, user });
      if (pathname.startsWith("/admin") && user.role !== "admin") {
        router.replace("/today");
        return;
      }
      if (pathname.startsWith("/schedule") && user.role !== "admin") {
        router.replace("/today");
        return;
      }
      setAuthorizedPath(pathname);
    }).catch(() => {
      if (!active) return;
      clearAuth();
      router.replace("/login");
    });
    return () => { active = false; };
  }, [isPublic, pathname, router]);

  if (!isPublic && authorizedPath !== pathname) {
    return (
      <div className="font-pretendard flex min-h-dvh items-center justify-center bg-[#ebf4ff]">
        <p className="text-sm font-semibold text-[#6b7fa0]">로그인 확인 중…</p>
      </div>
    );
  }
  return children;
}
