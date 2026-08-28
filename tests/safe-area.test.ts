import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const styles = ["foundation.css", "auth.css", "responsive.css"]
  .map((file) => readFileSync(path.join(process.cwd(), "app/css", file), "utf8"))
  .join("\n");
const layout = readFileSync(path.join(process.cwd(), "app/layout.tsx"), "utf8");

describe("iPhone safe areas", () => {
  it("opts into edge-to-edge layout and adds every safe inset to the normal spacing", () => {
    expect(layout).toContain('viewportFit: "cover"');
    expect(styles).toContain("--safe-top: env(safe-area-inset-top, 0px)");
    expect(styles).toContain("bottom: calc(10px + var(--safe-bottom))");
    expect(styles).toContain("calc(22px + var(--safe-top))");
    expect(styles).toContain("calc(50px + var(--safe-bottom))");
  });
});
