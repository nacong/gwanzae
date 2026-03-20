import { DispatchTask } from "./utils";

export async function processImageWithOCR(imageFile: File): Promise<Partial<DispatchTask>[]> {
  // Simulate Gemini API call delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Mock data for multiple items extracted from a single photo
  return [
    {
      applicant: "홍길동",
      itemNumber: "SN-2024-001",
      itemName: "네트워크 스위치",
      location: "공학관 302호",
    },
    {
      applicant: "이순신",
      itemNumber: "SN-2024-002",
      itemName: "보안 카메라",
      location: "학생회관 101호",
    },
    {
      applicant: "강감찬",
      itemNumber: "SN-2024-003",
      itemName: "무선 AP",
      location: "본관 205호",
    }
  ];
}

export type LogisticsRecommendation = {
  shouldDispatch: boolean;
  route?: string[];
  reason?: string;
};

export async function getLogisticsRecommendation(
  tasks: Partial<DispatchTask>[],
  staffCount: number,
  pendingTasks: DispatchTask[]
): Promise<LogisticsRecommendation> {
  // Simulate Gemini API call delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // 1. If staffCount is 0, always suggest delaying.
  if (staffCount <= 0) {
    return {
      shouldDispatch: false,
      reason: "현재 근무 중인 인원이 없습니다. 대기 모드로 전환합니다."
    };
  }

  // 2. Aggregate all locations
  const allBuildings = [
    ...tasks.map(t => t.location?.split(' ')[0] || ""),
    ...pendingTasks.map(t => t.location.split(' ')[0])
  ].filter(b => b !== "");

  // Unique list of buildings
  const uniqueBuildings = Array.from(new Set(allBuildings));

  // Mock optimization: Sorting in a specific "logical" order for the mock map
  // Sequence: 본관 -> 공학관 -> 경상관 -> 인문관 -> 자연과학관 -> 미래관 -> 학생회관
  const buildOrder = ["본관", "공학관", "경상관", "인문관", "자연과학관", "미래관", "학생회관"];
  const optimizedRoute = buildOrder.filter(b => uniqueBuildings.includes(b));

  // If too few staff for many tasks, suggest waiting if needed, 
  // but usually with multiple tasks, dispatching is better.
  if (staffCount < 1 && tasks.length < 2) {
      return {
          shouldDispatch: false,
          reason: "인원이 부족하고 의뢰 건수가 적어 보류를 권장합니다."
      };
  }

  return {
    shouldDispatch: true,
    route: optimizedRoute,
  };
}
