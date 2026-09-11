import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectiveSegmentEnd, findGrammarChunks, YouTubePractice } from "@/components/YouTubePractice";
import { apiFetch } from "@/lib/api";

import { youtubeStore } from "@/lib/youtubeStore";
import { DEFAULT_LEARNING_PRESETS } from "@/lib/learningSession";

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { },
  apiFetch: vi.fn(),
}));

const player = {
  cueVideoById: vi.fn(),
  destroy: vi.fn(),
  getCurrentTime: vi.fn(() => 0),
  pauseVideo: vi.fn(),
  playVideo: vi.fn(),
  seekTo: vi.fn(),
  setPlaybackRate: vi.fn(),
};

const entry = {
  contentId: "rGQkLXIey4Y",
  entrySource: "direct" as const,
  youtubeUrl: "https://www.youtube.com/watch?v=rGQkLXIey4Y",
  title: "Office English",
};

function renderPractice() {
  youtubeStore.prepareVideo(entry.youtubeUrl);
  return render(<YouTubePractice entry={entry} presets={DEFAULT_LEARNING_PRESETS} onChangeContent={vi.fn()} onEndSession={vi.fn()} onSessionEntryChange={vi.fn()} onOpenReview={vi.fn()} onNextRoutine={vi.fn()} />);
}

describe("YouTubePractice", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    youtubeStore.resetForTesting();
    delete window.LoopineNativeTranslation;
    delete window.LoopineNativeTranslationHost;
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({
      id: "job-1",
      video_id: "rGQkLXIey4Y",
      status: "COMPLETED",
      provider: "LOCAL_GPU",
      progress: 100,
      error_message: null,
      result: {
        video_id: "rGQkLXIey4Y",
        language: "English",
        language_code: "en",
        is_generated: true,
        segments: [
          { id: "a".repeat(64), text: "Welcome to Office English.", start: 4.2, duration: 2.5, end: 6.7 },
          { id: "b".repeat(64), text: "Let's begin the meeting.", start: 7, duration: 2, end: 9 },
        ],
      },
    });
    window.YT = {
      Player: vi.fn((_element, options) => {
        options.events?.onReady?.();
        return player;
      }) as unknown as NonNullable<typeof window.YT>["Player"],
    };
  });

  it("loads automatic captions and starts a segment loop", async () => {
    renderPractice();

    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/youtube/jobs", expect.objectContaining({ method: "POST" }));
    // expect(screen.getByText("YouTube 자동 생성 자막")).toBeInTheDocument();
    // expect(screen.getByRole("link", { name: /YouTube 열기/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=rGQkLXIey4Y");

    await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Let's begin the meeting/ }));
    await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(7, true));
    expect(player.playVideo).toHaveBeenCalled();
    expect(screen.getByText(/구간 반복 중/)).toHaveTextContent("0 / 3");
  });

  it("changes the repeat count used by the selected line", async () => {
    renderPractice();
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "5회" }));
    expect(screen.getByRole("button", { name: "5회 반복 시작" })).toBeInTheDocument();
    expect(screen.getByText("누르면 바로 5회 반복")).toBeInTheDocument();
  });

  it("applies blur effect on subtitle text when hidden and unblurs on click", async () => {
    renderPractice();
    const heading = await screen.findByRole("heading", { name: "Welcome to Office English." });
    expect(heading).not.toHaveClass("blurred-text");

    fireEvent.click(screen.getByRole("button", { name: /자막 숨기기/ }));
    expect(heading).toHaveClass("blurred-text");

    fireEvent.click(heading);
    expect(heading).not.toHaveClass("blurred-text");
  });

  it("extends an implausibly short caption until the next cue", () => {
    const segments = [
      {
        id: "a".repeat(64),
        text: "Was first broadcast on the BBC Learning English website in October 2014.",
        start: 2.6,
        end: 3.9,
        duration: 1.3,
      },
      { id: "b".repeat(64), text: "For more English language learning programmes.", start: 7.96, end: 9.26, duration: 1.3 },
    ];

    expect(effectiveSegmentEnd(segments, 0)).toBeGreaterThan(6.9);
    expect(effectiveSegmentEnd(segments, 0)).toBeLessThan(7.96);
  });

  it("trusts the server playback window when speech bounds are present", () => {
    // 같은 짧은 창이지만 발화 경계가 있다 = 서버가 이웃 간격까지 보고 확정한 값.
    // 여기서 단어 수로 다시 늘리면 다음 대사(7.96)까지 파고들어 뒤 대사가 들린다.
    const segments = [
      {
        id: "a".repeat(64),
        text: "Was first broadcast on the BBC Learning English website in October 2014.",
        start: 2.45,
        end: 3.9,
        duration: 1.45,
        speech_start: 2.6,
        speech_end: 3.7,
      },
      { id: "b".repeat(64), text: "For more English language learning programmes.", start: 7.81, end: 9.46, duration: 1.65 },
    ];

    expect(effectiveSegmentEnd(segments, 0)).toBe(3.9);
  });

  it("detects useful grammar chunks without an AI request", () => {
    expect(findGrammarChunks("I have to leave as soon as the meeting ends.")).toEqual([
      { text: "have to", label: "have to", meaning: "~해야 한다 · 의무/필요" },
      { text: "as soon as", label: "as soon as", meaning: "~하자마자" },
    ]);
  });

  it("opens a mobile translation bottom sheet and prevents rapid duplicate requests", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    renderPractice();
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Welcome to Office English.",
      translation: "오피스 영어에 오신 것을 환영합니다.",
      model: "llama-3.3-70b-versatile",
      cached: false,
    });

    const translateButton = screen.getByRole("button", { name: /^번역/ });
    fireEvent.click(translateButton);
    fireEvent.click(translateButton);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(await screen.findByText("오피스 영어에 오신 것을 환영합니다.")).toBeInTheDocument();
    expect(document.body.style.position).toBe("fixed");
    expect(document.documentElement).toHaveClass("translation-sheet-open");
    expect(screen.getByText(/선택한 구절은 기기 번역/)).toBeInTheDocument();
    const videoListenButton = screen.getByRole("button", { name: "영상 듣기" });
    const speechButton = screen.getByRole("button", { name: "발음 듣기" });
    expect(videoListenButton).toBeInTheDocument();
    expect(speechButton).toBeInTheDocument();
    fireEvent.click(videoListenButton);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const translationCalls = vi.mocked(apiFetch).mock.calls.filter(([path]) =>
      String(path).includes("/translate"),
    );
    expect(translationCalls).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "번역 닫기" }));
    expect(document.body.style.position).toBe("");
    expect(document.documentElement).not.toHaveClass("translation-sheet-open");
  });

  it("uses the Capacitor native translation sheet instead of the web dialog", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const present = vi.fn();
    const update = vi.fn();
    window.LoopineNativeTranslation = { present, update, notify: vi.fn() };
    renderPractice();
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Welcome to Office English.",
      translation: "오피스 영어에 오신 것을 환영합니다.",
      model: "openai/gpt-oss-120b",
      cached: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /^번역/ }));

    expect(present).toHaveBeenCalledWith(expect.objectContaining({
      sourceText: "Welcome to Office English.",
      loading: true,
    }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({
      translation: "오피스 영어에 오신 것을 환영합니다.",
      loading: false,
    })));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not call translation API when native text selection changes", async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const present = vi.fn();
    const update = vi.fn();
    window.LoopineNativeTranslation = { present, update, notify: vi.fn() };
    renderPractice();
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Welcome to Office English.",
      translation: "오피스 영어에 오신 것을 환영합니다.",
      model: "openai/gpt-oss-120b",
      cached: false,
    });

    fireEvent.click(screen.getByRole("button", { name: /^번역/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ loading: false })));
    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Office English",
      translation: "오피스 영어",
      model: "openai/gpt-oss-120b",
      cached: false,
    });

    window.dispatchEvent(new CustomEvent("loopine:native-translation-action", {
      detail: {
        action: "selection",
        segmentId: "a".repeat(64),
        text: "Office English",
      },
    }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ selectionText: "Office English", selectionTranslation: "오피스 영어" })));
  });

  it("plays the segment video audio when receiving listen action from native translation sheet", async () => {
    // jsdom 에는 speechSynthesis 가 없다. 「영상 듣기」가 TTS 로 새는지 보려면
    // 직접 심어야 한다.
    const speak = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel: vi.fn() },
    });

    try {
      renderPractice();
      expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();
      await waitFor(() => expect(window.YT?.Player).toHaveBeenCalled());

      window.dispatchEvent(new CustomEvent("loopine:native-translation-action", {
        detail: {
          action: "listen",
          segmentId: "b".repeat(64),
          slow: false,
        },
      }));

      await waitFor(() => expect(player.seekTo).toHaveBeenCalledWith(7, true));
      expect(player.playVideo).toHaveBeenCalled();
      // 이 핸들러는 transcript/videoId 가 바뀔 때만 등록되므로, 플레이어 준비
      // 여부를 상태 변수로 읽으면 영원히 false 를 본다(스테일 클로저). 그러면
      // 「영상 듣기」가 조용히 기계 목소리로 바뀌어 「발음 듣기」와 구별되지 않는다.
      expect(speak).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });

  it("handles player error 101/150 by stopping active job, alerting user, and calling onEndSession", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
    const onEndSession = vi.fn();
    const stopActiveJobSpy = vi.spyOn(youtubeStore, "stopActiveJob");

    let capturedOnError: ((event: { data: number }) => void) | undefined;
    window.YT = {
      Player: vi.fn((_element, options) => {
        capturedOnError = options.events?.onError;
        options.events?.onReady?.();
        return player;
      }) as unknown as NonNullable<typeof window.YT>["Player"],
    };

    render(
      <YouTubePractice
        entry={entry}
        presets={DEFAULT_LEARNING_PRESETS}
        onChangeContent={vi.fn()}
        onEndSession={onEndSession}
        onSessionEntryChange={vi.fn()}
        onOpenReview={vi.fn()}
        onNextRoutine={vi.fn()}
      />
    );

    await waitFor(() => expect(capturedOnError).toBeDefined());

    // Simulate YouTube iframe player reporting error 150 (embed disabled)
    capturedOnError!({ data: 150 });

    expect(stopActiveJobSpy).toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining("소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다"));
    expect(onEndSession).toHaveBeenCalled();

    alertMock.mockRestore();
    stopActiveJobSpy.mockRestore();
  });

  it("switches mutually between speech practice sheet and translation panel on desktop", async () => {
    renderPractice();
    expect(await screen.findByRole("heading", { name: "Welcome to Office English." })).toBeInTheDocument();

    vi.mocked(apiFetch).mockResolvedValueOnce({
      segment_id: "a".repeat(64),
      video_id: "rGQkLXIey4Y",
      source_text: "Welcome to Office English.",
      translation: "오피스 영어에 오신 것을 환영합니다.",
      model: "llama-3.3-70b-versatile",
      cached: true,
    });

    const recordButton = screen.getByRole("button", { name: /녹음/ });
    const translateButton = screen.getByRole("button", { name: /^번역/ });

    // 1. Open recording popup
    fireEvent.click(recordButton);
    expect(screen.getByRole("heading", { name: "문장 말해보기" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /번역|표현/ })).not.toBeInTheDocument();

    // 2. Click translation button while recording popup is open -> recording closes, translation opens
    fireEvent.click(translateButton);
    expect(await screen.findByText("오피스 영어에 오신 것을 환영합니다.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "문장 말해보기" })).not.toBeInTheDocument();

    // 3. Click recording button while translation popup is open -> translation closes, recording opens
    fireEvent.click(recordButton);
    expect(screen.getByRole("heading", { name: "문장 말해보기" })).toBeInTheDocument();
    expect(screen.queryByText("오피스 영어에 오신 것을 환영합니다.")).not.toBeInTheDocument();
  });
});
