import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpeechPracticeSheet } from "@/components/SpeechPracticeSheet";
import { apiFetch } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(),
}));

const saveRecordingOnDevice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/learningSession", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learningSession")>()),
  saveRecordingOnDevice,
}));

const entry = { contentId: "content-1", entrySource: "direct" as const, title: "Test" };

/** 시트가 닫힐 때 stop() 과 트랙 해제가 호출되는지 기록하는 녹음기. */
class TrackingRecorder {
  static instances: TrackingRecorder[] = [];
  static isTypeSupported = () => true;
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  stopCalls = 0;
  constructor(public stream: { getTracks: () => { stop: () => void }[] }) {
    TrackingRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  requestData() {}
  stop() {
    this.stopCalls += 1;
    this.state = "inactive";
    this.onstop?.();
  }
}

function mockMedia() {
  TrackingRecorder.instances = [];
  const trackStop = vi.fn();
  vi.stubGlobal("MediaRecorder", TrackingRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] }) },
  });
  return { trackStop };
}

function renderSheet(open: boolean) {
  return render(
    <SpeechPracticeSheet
      open={open}
      entry={entry}
      lineId="line-7"
      referenceText="I have to make sure."
      onClose={vi.fn()}
      onListen={vi.fn()}
    />
  );
}

async function startRecordingIn(view: ReturnType<typeof render>) {
  fireEvent.click(view.container.ownerDocument.querySelector(".speech-record-main") as HTMLElement);
  await waitFor(() => expect(TrackingRecorder.instances).toHaveLength(1));
  expect(TrackingRecorder.instances[0].state).toBe("recording");
}

beforeEach(() => {
  delete window.LoopineNativeRecording;
  delete window.LoopineNativeRecordingHost;
  vi.clearAllMocks();
  saveRecordingOnDevice.mockReset();
});

describe("Speech sheet releases the microphone", () => {
  it("stops the recorder and mic tracks when the sheet closes mid-recording, without saving", async () => {
    const { trackStop } = mockMedia();
    const view = renderSheet(true);
    await startRecordingIn(view);

    view.rerender(
      <SpeechPracticeSheet open={false} entry={entry} lineId="line-7" referenceText="I have to make sure." onClose={vi.fn()} onListen={vi.fn()} />
    );

    const recorder = TrackingRecorder.instances[0];
    expect(recorder.stopCalls).toBe(1);
    expect(recorder.state).toBe("inactive");
    expect(trackStop).toHaveBeenCalled();
    // 닫힌 시트에서 뒤늦게 저장/STT 가 돌면 안 된다.
    expect(saveRecordingOnDevice).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("stops the recorder and mic tracks on unmount", async () => {
    const { trackStop } = mockMedia();
    const view = renderSheet(true);
    await startRecordingIn(view);

    view.unmount();

    expect(TrackingRecorder.instances[0].stopCalls).toBe(1);
    expect(trackStop).toHaveBeenCalled();
    expect(saveRecordingOnDevice).not.toHaveBeenCalled();
  });

  it("closes the sheet (and the mic) when the learning tab goes to the background", async () => {
    const { trackStop } = mockMedia();
    const onClose = vi.fn();
    const view = render(
      <SpeechPracticeSheet open entry={entry} lineId="line-7" referenceText="Hi" onClose={onClose} onListen={vi.fn()} />
    );
    await startRecordingIn(view);

    window.dispatchEvent(new CustomEvent("loopine:tab-visibility", { detail: { tab: "learn", active: false } }));
    expect(onClose).toHaveBeenCalled();

    // 부모가 onClose 에 반응해 open=false 로 바꾸면 마이크가 놓인다.
    view.rerender(
      <SpeechPracticeSheet open={false} entry={entry} lineId="line-7" referenceText="Hi" onClose={onClose} onListen={vi.fn()} />
    );
    expect(trackStop).toHaveBeenCalled();
  });
});
