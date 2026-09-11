import { afterEach, describe, expect, it, vi } from "vitest";
import { presentNativePlacePicker } from "@/lib/nativePlacePicker";

type NativeWindow = Window & {
  Capacitor?: { isNativePlatform: () => boolean };
  LoopineNativePlacePickerHost?: { present: (payload: string) => void };
};

describe("native place picker bridge", () => {
  afterEach(() => {
    const target = window as NativeWindow;
    delete target.Capacitor;
    delete target.LoopineNativePlacePickerHost;
  });

  it("passes the initial coordinate to Android and resolves the selected place", async () => {
    const target = window as NativeWindow;
    const present = vi.fn();
    target.Capacitor = { isNativePlatform: () => true };
    target.LoopineNativePlacePickerHost = { present };

    const selection = presentNativePlacePicker({ latitude: 37.5, longitude: 127, addressLabel: "회사" });
    expect(JSON.parse(present.mock.calls[0][0])).toEqual({ latitude: 37.5, longitude: 127, addressLabel: "회사" });

    window.dispatchEvent(new CustomEvent("loopine:native-place-picker-result", {
      detail: { status: "selected", latitude: 37.51, longitude: 127.01, addressLabel: "새 회사" },
    }));

    await expect(selection).resolves.toEqual({ latitude: 37.51, longitude: 127.01, addressLabel: "새 회사" });
  });

  it("falls back when no native bridge is installed", async () => {
    await expect(presentNativePlacePicker({})).resolves.toBe("unavailable");
  });
});
