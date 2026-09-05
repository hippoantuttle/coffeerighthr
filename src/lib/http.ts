export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const body = await response
    .json()
    .catch(() => ({
      error: "서버 응답을 읽지 못했습니다. 다시 시도해주세요.",
    }));
  if (!response.ok)
    throw new HttpError(
      body.error ?? "요청에 실패했습니다.",
      response.status,
      body,
    );
  return body as T;
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
