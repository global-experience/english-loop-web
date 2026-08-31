import { describe, expect, it } from "vitest";
import { isHapticsEnabled, triggerHapticImpact, triggerHapticNotification, triggerHapticSelection } from "@/lib/haptics";

describe("Haptics module", () => {
  it("defaults to enabled", () => {
    expect(isHapticsEnabled()).toBe(true);
  });

  it("safely executes impact, selection, and notification without throwing", async () => {
    await expect(triggerHapticImpact("light")).resolves.not.toThrow();
    await expect(triggerHapticSelection()).resolves.not.toThrow();
    await expect(triggerHapticNotification("success")).resolves.not.toThrow();
  });
});
