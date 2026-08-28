import { afterEach, describe, expect, it, vi } from "vitest";

import { getApiBase } from "@/lib/api";

describe("getApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers the Vercel same-origin backend rewrite", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/backend/");

    expect(getApiBase()).toBe("/backend");
  });

  it("uses the browser host for local and LAN development", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000");

    expect(getApiBase()).toBe(`${window.location.protocol}//${window.location.hostname}:8000`);
  });

  it("accepts an explicitly configured remote API origin", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.loopine.example/");

    expect(getApiBase()).toBe("https://api.loopine.example");
  });
});
