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

  it("ignores a remote API origin in the public browser config", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.loopine.example/");

    expect(getApiBase()).toBe("/backend");
  });

  it("allows LAN API origins for local device testing", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://192.168.0.34:8000/");

    expect(getApiBase()).toBe("http://192.168.0.34:8000");
  });
});
