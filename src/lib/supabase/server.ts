import { createClient } from "@supabase/supabase-js";

const CLOCK_SKEW_RETRY_DELAYS_MS = [200, 600] as const;

function isClockSkewResponse(status: number, body: string) {
  return (
    status === 401 &&
    (body.includes("PGRST303") || body.includes("JWT issued at future"))
  );
}

export async function fetchWithClockSkewRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetcher: typeof fetch = fetch,
  delays: readonly number[] = CLOCK_SKEW_RETRY_DELAYS_MS,
) {
  let response = await fetcher(input, init);

  for (const delay of delays) {
    const body = response.status === 401 ? await response.clone().text() : "";
    if (!isClockSkewResponse(response.status, body)) break;

    await new Promise((resolve) => setTimeout(resolve, delay));
    response = await fetcher(input, init);
  }

  return response;
}

export function createServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 필요합니다.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithClockSkewRetry },
  });
}
