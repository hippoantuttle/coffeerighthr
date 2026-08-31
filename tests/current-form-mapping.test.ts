import { describe, expect, it } from "vitest";
import { inferColumnMapping } from "../src/lib/import/mapping";

const headers = [
"타임스탬프","개인정보 수집 및 이용에 동의하십니까?","성명 (Ex. 홍길동)","전공 (Ex. 경영학과)","학번 (Ex. 25)","학년/학기\n(26년 2학기 기준)","성별","생년월일 (Ex. 2001.01.01)","이메일 (연세 메일)","전화번호 (Ex. 010-1234-5678)","관심분야를 선택해주세요 (중복 가능)","지원 동기를 포함하여 본인을 자유롭게 소개해주세요. 카페투어, 핸드드립, 홈카페, 카페 알바 등 커피와 관련된 경험이 있다면 함께 작성해주세요. (공백포함 1000자 이내)","커피라이트에서 꼭 경험하거나 도전해 보고 싶은 활동에 대해 작성해 주세요.","동아리, 학업, 프로젝트, 취미, 소모임 등 타인과 협업했거나 개인적으로 몰입했던 경험이 있다면 간단히 작성해 주세요. (※ 거창한 경험이 아니어도 괜찮습니다)","어떤 경로로 커피라이트를 알게 되었는지 선택해주세요 (합/불에 영향을 미치지 않는 단순 정보수집용 질문입니다.)","면접 일정 - 9월 7일(월)\n연세대학교 신촌캠퍼스 도서관\n: 가능한 시간대를 모두 체크해주세요 \n(14시~21시) [9월 7일 (월)]","동아리 정규 세션 외 프로그램은 추가 금액이 발생할 수 있습니다. \n동아리 정규 세션은 매주 금요일 오후 3시와 4시30분에 진행되나, \n이번 학기 휴일인 금요일이 많은 관계로 목요일에 진행될 수 있습니다.\n많은 참여 부탁드립니다.","OT - 9월 11일(금)\nMT - 9월 11/12일(금, 토)\nOT / MT 참여가 힘드신 분은 사유를 적어주세요\n(가능한 참여 부탁드립니다)","서류 및 면접 합격/불합격 소식은 9월 8일(화)에 개별적으로 연락드릴 예정입니다.\n커피라이트에 지원해주신 모든 분들께 진심으로 감사드립니다."
];

describe("6기 current Google Form mapping", () => {
  it("maps all operational and three core essay fields", () => {
    const map = inferColumnMapping(headers);
    const targets = map.map(x => x.target);
    expect(targets).toContain("submittedAt");
    expect(targets).toContain("email");
    expect(targets).toContain("phone");
    expect(targets).toContain("answerMotivation");
    expect(targets).toContain("answerActivity");
    expect(targets).toContain("answerCollaboration");
    expect(targets).toContain("interviewAvailability");
    expect(targets).toContain("otMtReason");
  });
});
