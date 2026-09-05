import type { ColumnMapping, MappingTarget } from "./types";

function clean(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

const rules: Array<{
  target: MappingTarget;
  high: string[];
  medium?: string[];
}> = [
  {
    target: "submittedAt",
    high: ["타임스탬프", "제출 시간", "제출시간", "timestamp"],
  },
  {
    target: "consent",
    high: ["개인정보 수집", "개인정보 제공", "개인정보 동의"],
  },
  { target: "name", high: ["성명", "이름"], medium: ["지원자명"] },
  { target: "major", high: ["전공", "학과"] },
  { target: "studentNumber", high: ["학번"] },
  { target: "grade", high: ["학년", "학기"], medium: ["재학 학기"] },
  { target: "gender", high: ["성별"] },
  { target: "birthDate", high: ["생년월일", "생일"] },
  {
    target: "email",
    high: ["연세 메일", "연세메일", "이메일", "email", "메일 주소"],
  },
  { target: "phone", high: ["전화번호", "휴대폰", "연락처"] },
  {
    target: "interests",
    high: ["관심 분야", "관심분야"],
    medium: ["커피·차·주류", "커피, 차, 주류"],
  },
  {
    target: "source",
    high: [
      "유입 경로",
      "지원 경로",
      "알게 된 경로",
      "어떤 경로",
      "알게 되었는지",
    ],
  },
  {
    target: "interviewAvailability",
    high: ["면접 가능", "면접시간", "면접 시간", "면접 일정", "가능한 시간대"],
  },
  {
    target: "sessionConfirmation",
    high: ["정규 세션", "추가 비용"],
    medium: ["비용 확인", "세션 참여"],
  },
  {
    target: "otMtReason",
    high: ["ot/mt", "ot / mt", "ot 및 mt", "ot, mt", "불참 사유"],
  },
  {
    target: "answerMotivation",
    high: ["지원 동기", "자기소개"],
    medium: ["커피 관련 경험"],
  },
  {
    target: "answerActivity",
    high: ["경험하거나 도전", "도전하고 싶은 활동"],
    medium: ["하고 싶은 활동"],
  },
  {
    target: "answerCollaboration",
    high: ["협업", "몰입했던 경험", "몰입한 경험"],
    medium: ["타인과"],
  },
];

export function inferColumnMapping(headers: string[]): ColumnMapping[] {
  return headers.map((header) => {
    const h = clean(header);
    for (const rule of rules) {
      if (rule.high.some((token) => h.includes(clean(token))))
        return { header, target: rule.target, confidence: "high" };
    }
    for (const rule of rules) {
      if (rule.medium?.some((token) => h.includes(clean(token))))
        return { header, target: rule.target, confidence: "medium" };
    }
    return { header, target: "extra", confidence: "low" };
  });
}
