import { GoogleGenerativeAI } from "@google/generative-ai";
import { ApplicationItem, DispatchApplication, DispatchTask } from "./utils";

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

export async function scanApplication(imageFile: File): Promise<Omit<DispatchApplication, "id" | "status" | "createdAt">> {
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const base64 = await fileToBase64(imageFile);
  const imagePart = { inlineData: { data: base64, mimeType: imageFile.type as "image/jpeg" | "image/png" | "image/webp" } };

  const prompt = `이 이미지는 대학교 관재처의 "물품 불용/반납신청서"입니다.
아래 JSON 형식으로 정확히 추출하세요. 값을 읽을 수 없으면 빈 문자열 또는 0을 사용하세요.

{
  "applicationNumber": "신청번호",
  "department": "신청부서",
  "applicant": "신청자",
  "contact": "연락처",
  "applicationDate": "신청일 (YYYY-MM-DD)",
  "totalQuantity": 총수량(숫자),
  "totalAmount": 총금액(숫자, 콤마 제거),
  "items": [
    {
      "seq": 순번(숫자),
      "category": "구분(불용 또는 반납)",
      "itemName": "품명",
      "assetNumber": "자산번호",
      "spec": "규격/모델",
      "quantity": 수량(숫자),
      "price": 금액(숫자, 콤마 제거),
      "purchaseDate": "구입일(YYYY-MM-DD)",
      "usefulLife": 내용연수(숫자),
      "usedYears": 사용연수(숫자),
      "location": "설치장소",
      "reason": "불용신청사유"
    }
  ]
}

JSON만 반환하고 다른 텍스트는 절대 포함하지 마세요.`;

  const result = await model.generateContent([prompt, imagePart]);
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

  const buildOrder = ["본관", "공학관", "경상관", "인문관", "자연과학관", "미래관", "학생회관"];

  const allLocations = [
    ...application.items.map((i) => i.location.split(" ")[0]),
    ...pendingApplications.flatMap((a) => a.items.map((i) => i.location.split(" ")[0])),
  ].filter(Boolean);

  const uniqueBuildings = Array.from(new Set(allLocations));
  const optimizedRoute = buildOrder.filter((b) => uniqueBuildings.includes(b));

  return {
    shouldDispatch: true,
    route: optimizedRoute,
  };
}
