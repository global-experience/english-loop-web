"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";

export type TranscriptSegment = {
  id: string;
  text: string;
  start: number;
  duration: number;
  end: number;
  scene?: number;
  translation?: string;
};

export type TranscriptResponse = {
  video_id: string;
  language: string;
  language_code: string;
  is_generated: boolean;
  source?: "youtube_caption" | "youtube_caption+whisper" | "whisper" | "groq_whisper" | "cloudflare_whisper";
  segments: TranscriptSegment[];
};

export type YouTubeJobResponse = {
  id: string;
  video_id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  provider: "LOCAL_GPU" | "GROQ" | "CLOUDFLARE" | "CLOUD_AUTO" | "YOUTUBE_CAPTION";
  execution_target?: "LOCAL_CLOUD" | "RENDER_CLOUD" | "LOCAL_GPU" | null;
  progress: number;
  error_code?: string | null;
  error_message: string | null;
  result: TranscriptResponse | null;
};

export type YouTubePracticeState = {
  videoInput: string;
  videoId: string;
  transcript: TranscriptResponse | null;
  selectedIndex: number;
  repeatTarget: number;
  playbackRate: number;
  loading: boolean;
  jobProgress: number;
  jobProvider: YouTubeJobResponse["provider"] | null;
  executionTarget: YouTubeJobResponse["execution_target"] | null;
  error: string;
  activeJobId: string | null;
};

// Bump when transcript timing semantics change so an open PWA session cannot
// keep replaying stale server data after a deployment.
const STORAGE_KEY = "loopine_youtube_practice_v3";
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30 * 60 * 1000;

const initialState: YouTubePracticeState = {
  videoInput: "",
  videoId: "",
  transcript: null,
  selectedIndex: 0,
  repeatTarget: 3,
  playbackRate: 1,
  loading: false,
  jobProgress: 0,
  jobProvider: null,
  executionTarget: null,
  error: "",
  activeJobId: null,
};

type Listener = () => void;

class YouTubeStore {
  private state: YouTubePracticeState;
  private listeners = new Set<Listener>();
  private isPolling = false;
  private currentPollJobId: string | null = null;
  private initialized = false;

  constructor() {
    this.state = initialState;
    if (typeof window !== "undefined") {
      this.restoreFromStorage();
    }
  }

  private restoreFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<YouTubePracticeState>;
        this.state = {
          ...initialState,
          ...parsed,
          // If app was closed during loading, default loading back to false unless job polling resumes
          loading: parsed.loading && parsed.activeJobId ? true : false,
        };
      }
    } catch {
      this.state = initialState;
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage errors
    }
  }

  public getState = (): YouTubePracticeState => {
    return this.state;
  };

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => listener());
  }

  public setState(patch: Partial<YouTubePracticeState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  public resetForTesting() {
    this.stopProgressTicker();
    this.initialized = false;
    this.isPolling = false;
    this.currentPollJobId = null;
    this.state = initialState;
    this.notify();
  }

  public initDefaultIfNeeded() {
    if (this.initialized) return;
    this.initialized = true;
    if (this.state.loading && this.state.activeJobId && !this.isPolling) {
      void this.pollJob(this.state.activeJobId);
    }
  }

  public prepareVideo(url: string) {
    this.stopActiveJob();
    this.setState({
      ...initialState,
      videoInput: url.trim(),
    });
  }

  public stopActiveJob() {
    this.stopProgressTicker();
    this.isPolling = false;
    this.currentPollJobId = null;
    if (this.state.loading) this.setState({ loading: false, activeJobId: null, jobProgress: 0 });
  }

  public async loadTranscript(url: string) {
    const videoUrl = url.trim();
    if (!videoUrl) return;

    this.setState({
      videoInput: videoUrl,
      loading: true,
      jobProgress: 5,
      jobProvider: null,
      executionTarget: null,
      error: "",
      transcript: null,
    });

    try {
      const job = await apiFetch<YouTubeJobResponse>("/api/youtube/jobs", {
        method: "POST",
        body: JSON.stringify({ video: videoUrl, languages: ["en", "en-US", "en-GB"] }),
      });

      this.setState({
        videoId: job.video_id,
        jobProgress: Math.max(5, job.progress),
        jobProvider: job.provider,
        executionTarget: job.execution_target || null,
        activeJobId: job.id,
      });

      if (job.status === "COMPLETED" && job.result) {
        this.setState({
          transcript: job.result,
          videoId: job.result.video_id,
          selectedIndex: 0,
          loading: false,
          jobProgress: 100,
          activeJobId: null,
        });
        return;
      }

      if (job.status === "FAILED") {
        throw new Error(job.error_message || "영상 분석을 완료하지 못했습니다.");
      }

      // Start background polling
      void this.pollJob(job.id);
    } catch (caught) {
      const rawMsg = caught instanceof Error ? caught.message : "";
      const errorMsg = rawMsg.includes("Failed to fetch") || rawMsg.includes("NetworkError")
        ? "백엔드 서버에 연결할 수 없습니다. 백엔드 서버(make up)가 켜져 있는지 확인해 주세요."
        : rawMsg || "자동 자막을 가져오지 못했습니다.";

      this.setState({
        loading: false,
        jobProgress: 0,
        activeJobId: null,
        error: errorMsg,
      });
    }
  }

  private progressInterval: ReturnType<typeof setInterval> | null = null;

  private startProgressTicker() {
    this.stopProgressTicker();
    this.progressInterval = setInterval(() => {
      if (!this.state.loading) return;

      const current = this.state.jobProgress;
      if (current >= 98) return;

      // Realistic pacing matching AI transcription speed (takes ~15-20s):
      // 0-35%: steady rate (~0.6s per 1%)
      // 35-70%: AI speech analysis rate (~0.9s per 1%)
      // 70-88%: sentence alignment rate (~1.4s per 1%)
      // 88-97%: final completion stage (~2.2s per 1%)
      const delayChance =
        current >= 88
          ? 0.78
          : current >= 70
          ? 0.58
          : current >= 35
          ? 0.38
          : 0.15;

      if (Math.random() > delayChance) {
        this.setState({ jobProgress: current + 1 });
      }
    }, 450);
  }

  private stopProgressTicker() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private async pollJob(jobId: string) {
    if (this.isPolling && this.currentPollJobId === jobId) return;
    this.isPolling = true;
    this.currentPollJobId = jobId;
    this.startProgressTicker();
    const startedAt = Date.now();

    while (this.isPolling && this.currentPollJobId === jobId) {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        this.stopProgressTicker();
        this.setState({
          loading: false,
          jobProgress: 0,
          activeJobId: null,
          error: "영상 분석이 예상보다 오래 걸리고 있습니다. 잠시 후 같은 영상을 다시 요청해 주세요.",
        });
        break;
      }

      try {
        const job = await apiFetch<YouTubeJobResponse>(`/api/youtube/jobs/${jobId}`);

        this.setState({
          jobProgress: Math.max(this.state.jobProgress, job.progress),
          jobProvider: job.provider,
          executionTarget: job.execution_target || null,
          videoId: job.video_id,
        });

        if (job.status === "COMPLETED" && job.result) {
          this.stopProgressTicker();
          this.setState({
            transcript: job.result,
            videoId: job.result.video_id,
            selectedIndex: 0,
            loading: false,
            jobProgress: 100,
            activeJobId: null,
          });
          break;
        }

        if (job.status === "FAILED") {
          throw new Error(job.error_message || "영상 분석을 완료하지 못했습니다.");
        }
      } catch (caught) {
        this.stopProgressTicker();
        const rawMsg = caught instanceof Error ? caught.message : "";
        const errorMsg = rawMsg.includes("Failed to fetch") || rawMsg.includes("NetworkError")
          ? "백엔드 서버에 연결할 수 없습니다. 백엔드 서버(make up)가 켜져 있는지 확인해 주세요."
          : rawMsg || "영상 분석 중 오류가 발생했습니다.";

        this.setState({
          loading: false,
          jobProgress: 0,
          activeJobId: null,
          error: errorMsg,
        });
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (this.currentPollJobId === jobId) {
      this.stopProgressTicker();
      this.isPolling = false;
      this.currentPollJobId = null;
    }
  }
}

export const youtubeStore = new YouTubeStore();

export function useYouTubeStore(): [YouTubePracticeState, (patch: Partial<YouTubePracticeState>) => void, (url: string) => Promise<void>] {
  const state = useSyncExternalStore(
    youtubeStore.subscribe,
    youtubeStore.getState,
    youtubeStore.getState
  );

  return [
    state,
    (patch) => youtubeStore.setState(patch),
    (url) => youtubeStore.loadTranscript(url),
  ];
}
