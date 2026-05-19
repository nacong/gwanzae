import { GoogleGenerativeAI } from "@google/generative-ai";
import { BUILDINGS, DispatchApplication } from "./utils";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "");

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function scanApplication(
  imageFiles: File[]
): Promise<Omit<DispatchApplication, "id" | "status" | "createdAt" | "requiredPersonnel">> {
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const imageParts = await Promise.all(
    imageFiles.map(async (file) => ({
      inlineData: { data: await fileToBase64(file), mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" },
    }))
  );

  const buildingList = BUILDINGS.join(", ");

  const prompt = `이 이미지는 대학교 관재처의 "물품 불용/반납신청서"입니다.
아래 JSON 형식으로 정확히 추출하세요. 값을 읽을 수 없으면 빈 문자열 또는 0을 사용하세요.

{
  "신청번호": "신청번호 문자열",
  "신청일자": "신청일 (YYYY-MM-DD)",
  "신청부서": "신청부서명",
  "물품목록": [
    {
      "품명": "품명",
      "설치장소": "건물이름 호수명",
      "수량": 수량(숫자),
      "필요인원수": 필요인원수(숫자)
    }
  ]
}

## 물품목록 규칙 (반드시 준수)
품명이 동일한 항목은 하나로 합쳐서 반환하세요. 수량은 합산하고, 필요인원수는 가장 큰 값을 사용하세요.
예) 냉장고 2개(인원2) + 냉장고 1개(인원4) → 냉장고 수량:3, 필요인원수:4

## 설치장소 규칙 (반드시 준수)
설치장소는 반드시 "건물이름 호수명" 형식으로 작성하세요. 예시: 국제경영대학관 206
건물이름은 아래 목록 중 하나만 사용하세요:
${buildingList}
건물이름이 목록에 없거나 불명확하면 가장 유사한 이름으로 정정하세요.

JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const text = result.response.text().trim();

  const json = text.startsWith("```") ? text.replace(/```json?\n?/g, "").replace(/```$/g, "").trim() : text;
  return JSON.parse(json);
}

export type LogisticsRecommendation = {
  shouldDispatch: boolean;
  route?: string[];
  reason?: string;
};

export async function getLogisticsRecommendation(
  application: DispatchApplication,
  staffCount: number,
  pendingApplications: DispatchApplication[]
): Promise<LogisticsRecommendation> {
  if (staffCount <= 0) {
    return {
      shouldDispatch: false,
      reason: "현재 근무 중인 인원이 없습니다. 대기 모드로 전환합니다.",
    };
  }

  const allLocations = [
    ...application.물품목록.map((i) => i.설치장소.split(" ")[0]),
    ...pendingApplications.flatMap((a) => a.물품목록.map((i) => i.설치장소.split(" ")[0])),
  ].filter(Boolean);

  const uniqueBuildings = Array.from(new Set(allLocations));
  const optimizedRoute = BUILDINGS.filter((b) => uniqueBuildings.includes(b));

  return {
    shouldDispatch: true,
    route: optimizedRoute,
  };
}
