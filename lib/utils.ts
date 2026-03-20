import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type DispatchTask = {
  id: string;
  applicant: string;
  itemNumber: string;
  itemName: string;
  location: string;
  status: 'pending' | 'completed' | 'skipped';
  createdAt: number;
};

export type StaffStatus = {
  count: number;
  label: string;
};

export function getCurrentStaffStatus(): StaffStatus {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) to 6 (Sat)
  const hour = now.getHours();

  // Monday 8~19시: 3명
  if (day === 1 && hour >= 8 && hour < 19) {
    return { count: 3, label: "월요일 08:00~19:00 정규 근무 (3명)" };
  }
  
  // Tue~Fri 9~18시: 2명
  if (day >= 2 && day <= 5 && hour >= 9 && hour < 18) {
    return { count: 2, label: "평일 주간" };
  }

  // Saturday 10~15시: 1명
  if (day === 6 && hour >= 10 && hour < 15) {
    return { count: 1, label: "토요일 주간" };
  }

  return { count: 0, label: "야간/대기" };
}

export const BUILDINGS = [
    "본관", "공학관", "경상관", "인문관", "자연과학관", "학생회관", "미래관"
];
