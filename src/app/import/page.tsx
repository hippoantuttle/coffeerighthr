import ImportClient from "./ImportClient";
export default function ImportPage() {
  return (
    <main>
      <p className="muted">COFFEERIGHT · 데이터 가져오기</p>
      <h1>지원자 CSV 가져오기</h1>
      <p>Google Form 응답 CSV를 업로드하고 웹앱 필드와의 매핑을 확인합니다.</p>
      <ImportClient />
    </main>
  );
}
