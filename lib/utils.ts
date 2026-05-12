import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// One row in the 물품 불용/반납신청서
export type ApplicationItem = {
  seq: number;
  category: string;       // 구분 (불용/반납)
  itemName: string;       // 품명
  assetNumber: string;    // 자산번호
  spec: string;           // 규격/모델
  quantity: number;       // 수량
  price: number;          // 금액
  purchaseDate: string;   // 구입일
  usefulLife: number;     // 내용연수
  usedYears: number;      // 사용연수
  location: string;       // 설치장소
  reason: string;         // 불용신청사유
};

// One scanned 신청서 = one DispatchApplication
export type DispatchApplication = {
  id: string;
  applicationNumber: string;  // 신청번호
  department: string;         // 신청부서
  applicant: string;          // 신청자
  contact: string;            // 연락처
  applicationDate: string;    // 신청일
  totalQuantity: number;      // 총수량
  totalAmount: number;        // 총금액
  items: ApplicationItem[];
  requiredPersonnel: number;  // DB 조회 결과 필요 인원
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

export const BUILDINGS = [
    "본관", "공학관", "경상관", "인문관", "자연과학관", "학생회관", "미래관"
];
