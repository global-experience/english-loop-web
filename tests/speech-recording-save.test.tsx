import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechPracticeSheet } from "@/components/SpeechPracticeSheet";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

const saveRecordingOnDevice = vi.hoisted(() => vi.fn());
const loadRecordingFromDeviceMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/learningSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learningSession")>()),
  saveRecordingOnDevice,
  loadRecordingFromDevice: loadRecordingFromDeviceMock,
}));

const entry = { contentId: "content-1", entrySource: "direct" as const, title: "Test" };

/**
 * A MediaRecorder whose final `dataavailable` arrives *after* `onstop`, which is what
 * WebKit does on iOS. The old code snapshotted the chunk list inside `onstop` and
 * therefore saved an empty recording.
 */
class LateChunkRecorder {
  static isTypeSupported = (type: string) => type.includes("mp4");
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/mp4";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, options?: { mimeType?: string }) {
    if (options?.mimeType) this.mimeType = options.mimeType;
  }
  start() { this.state = "recording"; }
  requestData() { /* the late delivery below stands in for this flush */ }
  stop() {
    this.state = "inactive";
    this.onstop?.();
    // The tail chunk lands one tick later.
    setTimeout(() => this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)], { type: this.mimeType }) }), 20);
  }
}

class SilentRecorder extends LateChunkRecorder {
  stop() {
    this.state = "inactive";
    this.onstop?.();
    // No chunk ever arrives: the microphone produced nothing.
  }
}

function mockMedia(RecorderClass: unknown) {
  vi.stubGlobal("MediaRecorder", RecorderClass);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  });
}

function renderSheet() {
  return render(
    <SpeechPracticeSheet
      open
      entry={entry}
      lineId="line-7"
      referenceText="I have to make sure."
      onClose={vi.fn()}
      onListen={vi.fn()}
    />
  );
}

beforeEach(() => {
  delete window.LoopineNativeRecording;
  delete window.LoopineNativeRecordingHost;
  vi.clearAllMocks();
  saveRecordingOnDevice.mockReset();
});

describe("Saving a recording on the device", () => {
  it("waits for the tail chunk WebKit delivers after onstop", async () => {
    mockMedia(LateChunkRecorder);
    saveRecordingOnDevice.mockImplementation((blob: Blob) =>
      Promise.resolve({ id: "local-1", uri: null, storage: "indexeddb", mimeType: blob.type, durationSeconds: 3 })
    );
    vi.mocked(apiFetch).mockResolvedValue({ text: "I have to make sure", provider: "GROQ", request_id: "r1" });

    renderSheet();
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);

    await waitFor(() => expect(saveRecordingOnDevice).toHaveBeenCalled());
    const [blob] = saveRecordingOnDevice.mock.calls[0];
    // The late 4096-byte chunk made it into the saved blob.
    expect((blob as Blob).size).toBe(4096);
    expect((blob as Blob).type).toBe("audio/mp4");
    expect(await screen.findByText(/브라우저 DB에 저장됨/)).toBeInTheDocument();
  });

  it("sends the local recording id with the attempt once it is saved", async () => {
    mockMedia(LateChunkRecorder);
    saveRecordingOnDevice.mockResolvedValue({
      id: "local-1", uri: null, storage: "indexeddb", mimeType: "audio/mp4", durationSeconds: 3,
    });
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path).includes("transcribe")
        ? Promise.resolve({ text: "I have to make sure", provider: "GROQ", request_id: "r1" })
        : Promise.resolve({ id: "attempt-1", created_at: "" })
    );

    renderSheet();
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);
    await waitFor(() => expect(saveRecordingOnDevice).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: /자막과 비교하기/ }));
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      expect(post).toBeDefined();
      const body = JSON.parse(String((post![1] as RequestInit).body));
      expect(body.local_recording_id).toBe("local-1");
      expect(body.local_recording_storage).toBe("indexeddb");
    });
  });

  it("does not claim a saved recording when no store could keep it", async () => {
    mockMedia(LateChunkRecorder);
    // saveRecordingOnDevice reports failure with an empty id.
    saveRecordingOnDevice.mockResolvedValue({
      id: "", uri: null, storage: "memory", mimeType: "audio/mp4", durationSeconds: 3,
    });
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path).includes("transcribe")
        ? Promise.resolve({ text: "I have to make sure", provider: "GROQ", request_id: "r1" })
        : Promise.resolve({ id: "attempt-1", created_at: "" })
    );

    renderSheet();
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);

    expect(await screen.findByText(/이 브라우저가 녹음 파일을 저장하지 못했어요/, {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /자막과 비교하기/ }));
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      const body = JSON.parse(String((post![1] as RequestInit).body));
      // Honest record: no id, so the review tab says it was never saved on a device.
      expect(body.local_recording_id).toBeNull();
      expect(body.local_recording_storage).toBeNull();
    });
  });

  it("tells the learner when the microphone produced no audio", async () => {
    mockMedia(SilentRecorder);
    renderSheet();
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    fireEvent.click(document.querySelector(".speech-record-main") as HTMLElement);

    expect(await screen.findByText(/녹음된 소리가 없어요/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(saveRecordingOnDevice).not.toHaveBeenCalled();
  });
});

describe("Native app recordings", () => {
  const loadRecordingFromDevice = loadRecordingFromDeviceMock;

  function nativeBridge() {
    const update = vi.fn();
    window.LoopineNativeRecording = { present: vi.fn(), update, notify: vi.fn(), close: vi.fn() };
    return update;
  }

  function setNativePlatform(value: boolean) {
    (window as unknown as { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => value,
    };
  }

  function emitRecorded(localRecordingId: string | null) {
    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", {
      detail: {
        action: "recorded",
        audioBase64: btoa("fake-aac-bytes"),
        mimeType: "audio/mp4",
        durationSeconds: 4,
        lineId: "line-7",
        ...(localRecordingId ? { localRecordingId, localRecordingStorage: "capacitor-filesystem" } : {}),
      },
    }));
  }

  beforeEach(() => {
    loadRecordingFromDevice.mockReset();
    saveRecordingOnDevice.mockReset();
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path).includes("transcribe")
        ? Promise.resolve({ text: "I have to make sure", provider: "GROQ", request_id: "r1" })
        : Promise.resolve({ id: "attempt-1", created_at: "" })
    );
  });

  it("keeps the native id when the shell's file reads back", async () => {
    nativeBridge();
    setNativePlatform(true);
    loadRecordingFromDevice.mockResolvedValue({ status: "found", url: "blob:x", revoke: false, mimeType: "audio/mp4" });

    renderSheet();
    emitRecorded("native-1");

    await waitFor(() => expect(loadRecordingFromDevice).toHaveBeenCalledWith("native-1", "capacitor-filesystem"));
    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", {
      detail: { action: "compare", spokenText: "I have to make sure", lineId: "line-7" },
    }));
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      const body = JSON.parse(String((post![1] as RequestInit).body));
      expect(body.local_recording_id).toBe("native-1");
      expect(body.local_recording_storage).toBe("capacitor-filesystem");
    });
    expect(saveRecordingOnDevice).not.toHaveBeenCalled();
  });

  it("stores the bytes itself when the shell wrote somewhere the web app cannot read", async () => {
    // This is the iOS shell bug: the file exists, but under a directory the
    // Filesystem plugin's Directory.Data does not map to.
    nativeBridge();
    setNativePlatform(true);
    loadRecordingFromDevice.mockResolvedValue({ status: "missing", reason: "not-on-this-device" });
    saveRecordingOnDevice.mockResolvedValue({
      id: "recovered-1", uri: null, storage: "indexeddb", mimeType: "audio/mp4", durationSeconds: 4,
    });

    renderSheet();
    emitRecorded("native-stale");

    await waitFor(() => expect(saveRecordingOnDevice).toHaveBeenCalled());
    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", {
      detail: { action: "compare", spokenText: "I have to make sure", lineId: "line-7" },
    }));
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      const body = JSON.parse(String((post![1] as RequestInit).body));
      // The recovered copy is what the review tab will play.
      expect(body.local_recording_id).toBe("recovered-1");
      expect(body.local_recording_storage).toBe("indexeddb");
    });
  });

  it("records no device audio when nothing can keep the recording", async () => {
    nativeBridge();
    setNativePlatform(true);
    loadRecordingFromDevice.mockResolvedValue({ status: "missing", reason: "not-on-this-device" });
    saveRecordingOnDevice.mockResolvedValue({
      id: "", uri: null, storage: "memory", mimeType: "audio/mp4", durationSeconds: 4,
    });

    renderSheet();
    emitRecorded("native-stale");
    await waitFor(() => expect(saveRecordingOnDevice).toHaveBeenCalled());

    window.dispatchEvent(new CustomEvent("loopine:native-recording-action", {
      detail: { action: "compare", spokenText: "I have to make sure", lineId: "line-7" },
    }));
    await waitFor(() => {
      const post = vi.mocked(apiFetch).mock.calls.find(([path]) => path === "/api/learning/speech-attempts");
      const body = JSON.parse(String((post![1] as RequestInit).body));
      expect(body.local_recording_id).toBeNull();
      expect(body.local_recording_storage).toBeNull();
    });
  });
});
