export async function downloadFile(
  url: string,
  name: string,
  init?: RequestInit,
) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "다운로드에 실패했습니다.");
  }
  const blob = await response.blob(),
    objectUrl = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
