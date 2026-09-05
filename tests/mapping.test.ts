import { describe, it, expect } from "vitest";
import { inferColumnMapping } from "../src/lib/import/mapping";
import { normalizeEmail, normalizePhone } from "../src/lib/import/normalize";

describe("Google Form column mapping", () => {
  it("maps the known COFFEERIGHT form concepts", () => {
    const headers = [
      "타임스탬프",
      "성명",
      "전공",
      "학번",
      "생년월일",
      "연세 메일",
      "전화번호",
      "관심 분야",
      "지원 동기와 자기소개, 커피 관련 경험",
      "커피라이트에서 경험하거나 도전하고 싶은 활동",
      "타인과 협업했거나 개인적으로 몰입했던 경험",
      "면접 가능 시간대",
    ];
    const map = Object.fromEntries(
      inferColumnMapping(headers).map((m) => [m.header, m.target]),
    );
    expect(map["성명"]).toBe("name");
    expect(map["연세 메일"]).toBe("email");
    expect(map["전화번호"]).toBe("phone");
    expect(map["지원 동기와 자기소개, 커피 관련 경험"]).toBe(
      "answerMotivation",
    );
    expect(map["커피라이트에서 경험하거나 도전하고 싶은 활동"]).toBe(
      "answerActivity",
    );
    expect(map["타인과 협업했거나 개인적으로 몰입했던 경험"]).toBe(
      "answerCollaboration",
    );
  });
  it("normalizes dedupe identifiers", () => {
    expect(normalizeEmail(" TEST@YONSEI.AC.KR ")).toBe("test@yonsei.ac.kr");
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
  });
});
