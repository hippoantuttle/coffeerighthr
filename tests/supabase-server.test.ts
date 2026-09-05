import { describe, expect, it, vi } from "vitest";
import { fetchWithClockSkewRetry } from "@/lib/supabase/server";

describe("fetchWithClockSkewRetry", () => {
  it("retries a transient PostgREST JWT clock-skew response", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: "PGRST303", message: "JWT issued at future" }),
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithClockSkewRetry(
      "https://example.test",
      undefined,
      fetcher,
      [0],
    );

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry unrelated authorization failures", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const response = await fetchWithClockSkewRetry(
      "https://example.test",
      undefined,
      fetcher,
      [0, 0],
    );

    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
