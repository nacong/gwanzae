import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type 물품Item = {
  품명: string;
  설치장소: string;
  수량: number;
  필요인원수: number;
};

export type DispatchApplication = {
  id: string;
  신청번호: string;
  신청일자: string;
  신청부서: string;
  물품목록: 물품Item[];
  requiredPersonnel: number;
  status: 'unoptimized' | 'optimized' | 'completed';
  createdAt: number;
};

// 출동 시간 그룹 (최적화 결과)
export type DispatchTimeGroup = {
  id: string;
  scheduledDateTime: string;        // 예정 출동 일시
  applications: DispatchApplication[];
  isDispatched: boolean;            // 출동 버튼 눌렀는지
  optimizedRoute: string[];         // 최적 동선 (건물명 목록)
};

export type StaffStatus = {
  count: number;
  label: string;
};

// 2026학년도 1학기 근로 시간표 (2026.3.1.~6.19.)
const SCHEDULE: Record<number, { start: number; end: number; staff: string[] }[]> = {
  1: [ // 월
    { start: 9,  end: 12, staff: ["김경언"] },
    { start: 13, end: 15, staff: ["최현", "박우민", "정하람", "강경래"] },
    { start: 15, end: 17, staff: ["최현", "김경언", "박우민", "강경래"] },
  ],
  2: [ // 화
    { start: 9,  end: 12, staff: ["최현", "정하람", "강경래"] },
    { start: 13, end: 15, staff: ["최현", "김경언"] },
    { start: 15, end: 17, staff: ["박우민", "강경래"] },
  ],
  3: [ // 수
    { start: 9,  end: 12, staff: ["김경언"] },
    { start: 13, end: 15, staff: ["최현", "정하람", "강경래", "박우민"] },
    { start: 15, end: 17, staff: ["김경언", "최현", "박우민"] },
  ],
  4: [ // 목
    { start: 9,  end: 12, staff: ["최현", "강경래"] },
    { start: 13, end: 15, staff: ["최현", "김경언"] },
    { start: 15, end: 17, staff: ["박우민", "정하람", "강경래"] },
  ],
  5: [ // 금
    { start: 9,  end: 12, staff: ["김경언", "정하람"] },
    { start: 13, end: 17, staff: ["김경언", "박우민", "정하람"] },
  ],
};

export function getCurrentStaffStatus(): StaffStatus {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const slots = SCHEDULE[day];
  if (slots) {
    for (const slot of slots) {
      if (hour >= slot.start && hour < slot.end) {
        const names = slot.staff.join(", ");
        return { count: slot.staff.length, label: `근무: ${names}` };
      }
    }
  }

  return { count: 0, label: "근무 시간 외" };
}

export function getCurrentStaffNames(): string[] {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  const slots = SCHEDULE[day];
  if (slots) {
    for (const slot of slots) {
      if (hour >= slot.start && hour < slot.end) {
        return slot.staff;
      }
    }
  }

  return [];
}

export const BUILDINGS = [
  "공학관", "공학실험동", "국제경영대학관", "국제학관", "글로벌관",
  "도예관", "멀티미디어관", "생명과학대학관", "선승관",
  "실험연구동A", "실험연구동B", "예디대", "외국어대학관", "우정원",
  "원예생명공학온실", "전정대", "중앙도서관", "천문대", "체육대학관", "학생회관",
];
