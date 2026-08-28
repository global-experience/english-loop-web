import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync(path.join(process.cwd(), "public/manifest.webmanifest"), "utf8"));

describe("PWA manifest", () => {
  it("is installable and includes maskable icons", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
    expect(manifest.start_url).toBe("/");
  });
});
