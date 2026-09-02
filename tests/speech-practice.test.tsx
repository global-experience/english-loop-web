import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNativeRecordingBridge, SpeechPracticeSheet } from "@/components/SpeechPracticeSheet";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

const entry = {
  contentId: "test-content-1",
  entrySource: "direct" as const,
  title: "Test Content",
};

describe("SpeechPracticeSheet Native Bridge", () => {
  beforeEach(() => {
    delete window.LoopineNativeRecording;
    delete window.LoopineNativeRecordingHost;
    vi.clearAllMocks();
  });

  it("detects iOS native recording bridge", () => {
    const present = vi.fn();
    window.LoopineNativeRecording = { present };

    const bridge = getNativeRecordingBridge();
    expect(bridge).toBeDefined();
    bridge?.present({ lineId: "line-1", referenceText: "Hello world" });
    expect(present).toHaveBeenCalledWith({ lineId: "line-1", referenceText: "Hello world" });
  });

  it("detects Android native recording host bridge", () => {
    const present = vi.fn();
    window.LoopineNativeRecordingHost = { present };

    const bridge = getNativeRecordingBridge();
    expect(bridge).toBeDefined();
    bridge?.present({ lineId: "line-1", referenceText: "Hello world" });
    expect(present).toHaveBeenCalledWith(JSON.stringify({ lineId: "line-1", referenceText: "Hello world" }));
  });

  it("delegates to native bridge and responds to compare action", async () => {
    const present = vi.fn();
    const update = vi.fn();
    window.LoopineNativeRecording = { present, update };
    vi.mocked(apiFetch).mockResolvedValue({ id: "attempt-1", created_at: "2026-09-02T00:00:00Z" });

    const onListen = vi.fn();
    const onClose = vi.fn();
    const onSaved = vi.fn();

    render(
      <SpeechPracticeSheet
        open={true}
        entry={entry}
        lineId="line-10"
        referenceText="I have to make sure."
        onClose={onClose}
        onListen={onListen}
        onSaved={onSaved}
      />
    );

    expect(present).toHaveBeenCalledWith({
      lineId: "line-10",
      referenceText: "I have to make sure.",
      spokenText: "",
    });

    window.dispatchEvent(
      new CustomEvent("loopine:native-recording-action", {
        detail: { action: "listen", slow: true, lineId: "line-10" },
      })
    );
    expect(onListen).toHaveBeenCalledWith(true);

    window.dispatchEvent(
      new CustomEvent("loopine:native-recording-action", {
        detail: { action: "compare", spokenText: "I have to make sure.", lineId: "line-10" },
      })
    );

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/learning/speech-attempts",
        expect.objectContaining({ method: "POST" })
      );
      expect(onSaved).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          comparison: expect.objectContaining({ accuracy: 100 }),
        })
      );
    });
  });

  it("transcribes a native recording and sends the recognized text back to the sheet", async () => {
    const present = vi.fn();
    const update = vi.fn();
    window.LoopineNativeRecording = { present, update };
    vi.mocked(apiFetch).mockImplementation(async (path) => path.endsWith("/transcribe") ? {
      text: "I have to make sure.", provider: "GROQ", request_id: "request-1",
    } : { id: "attempt-2", created_at: "2026-09-02T00:00:00Z" });

    render(
      <SpeechPracticeSheet
        open={true}
        entry={entry}
        lineId="line-11"
        referenceText="I have to make sure."
        onClose={() => undefined}
        onListen={() => undefined}
      />
    );

    window.dispatchEvent(
      new CustomEvent("loopine:native-recording-action", {
        detail: {
          action: "recorded",
          audioBase64: window.btoa("fake-audio"),
          mimeType: "audio/mp4",
          durationSeconds: 3,
          localRecordingId: "native-recording-1",
          lineId: "line-11",
        },
      })
    );

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/learning/speech/transcribe",
        expect.objectContaining({ method: "POST", body: expect.any(FormData) })
      );
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        spokenText: "I have to make sure.",
        message: expect.stringContaining("GROQ"),
      }));
    });

    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", {
      detail: { action: "compare", spokenText: "I have to make sure.", lineId: "line-11" },
    }));
    await waitFor(() => {
      const attemptCall = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      expect(attemptCall).toBeDefined();
      expect(JSON.parse(String(attemptCall?.[1]?.body))).toEqual(expect.objectContaining({
        local_recording_id: "native-recording-1",
        local_recording_storage: "capacitor-filesystem",
        duration_seconds: 3,
        stt_provider: "GROQ",
      }));
    });
  });

  it("can reopen after the native sheet reports that it was dismissed", async () => {
    const present = vi.fn();
    const close = vi.fn();
    window.LoopineNativeRecording = { present, close };

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>녹음 열기</button>
          <SpeechPracticeSheet
            open={open}
            entry={entry}
            lineId="line-20"
            referenceText="Please say this twice."
            onClose={() => setOpen(false)}
            onListen={() => undefined}
          />
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "녹음 열기" }));
    expect(present).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", { detail: { action: "close" } }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "녹음 열기" }));
    expect(present).toHaveBeenCalledTimes(2);
  });
});
