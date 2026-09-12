"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Navigation, UserRound } from "lucide-react";
import { getStoredAuthUser } from "@/lib/auth";

export default function TabBar() {
  const pathname = usePathname();
  const role = useSyncExternalStore(
    () => () => undefined,
    () => getStoredAuthUser()?.role ?? null,
    () => null,
  );
  const visibleTabs = role === "admin"
    ? [
        { href: "/admin", label: "출동관리", Icon: Navigation },
        { href: "/schedule", label: "일정", Icon: CalendarDays },
        { href: "/profile", label: "내 정보", Icon: UserRound },
      ]
    : [
        { href: "/today", label: "출동관리", Icon: Navigation },
        { href: "/profile", label: "내 정보", Icon: UserRound },
      ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-[#e5e7eb] bg-white pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex h-16 items-center justify-around px-8">
        {visibleTabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex min-w-[56px] flex-col items-center justify-center gap-1"
            >
              <Icon size={20} className={active ? "text-[#0043ff]" : "text-[#9ca3af]"} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-[10px] ${active ? "font-bold text-[#0043ff]" : "font-medium text-[#9ca3af]"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
