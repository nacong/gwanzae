"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText } from "lucide-react";
import { getStoredAuthUser } from "@/lib/auth";

const TABS = [
  { href: "/today", label: "오늘", Icon: Home },
  { href: "/schedule", label: "신청서", Icon: FileText },
];

export default function TabBar() {
  const pathname = usePathname();
  const [role, setRole] = useState<"admin" | "worker" | null>(null);
  useEffect(() => { setRole(getStoredAuthUser()?.role ?? null); }, []);
  const visibleTabs = role === "admin" ? TABS : TABS.filter((tab) => tab.href === "/today");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-white pb-[calc(env(safe-area-inset-bottom,0px)+6px)]">
      <div className="flex h-16 items-center">
        {visibleTabs.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <Icon size={24} className={active ? "text-[#0043ff]" : "text-[#9ca3af]"} strokeWidth={active ? 2.4 : 2} />
              <span className={`text-xs font-semibold ${active ? "text-[#0043ff]" : "text-[#9ca3af]"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
