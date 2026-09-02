import type { Content } from "@/lib/types";

export type LearningEntrySource = "today" | "feed" | "library" | "direct";
export type RoutineStep = "MORNING_COMMUTE" | "LUNCH" | "EVENING_COMMUTE" | "NIGHT_VOICE";

export type LearningSessionEntry = {
  contentId: string | null;
  transcriptLineId?: string | null;
  entrySource: LearningEntrySource;
  routineStep?: RoutineStep | null;
  activityId?: string | null;
  youtubeUrl?: string | null;
  title?: string | null;
  sourceLabel?: string | null;
  content?: Content | null;
};

export type LearningPresetOptions = {
  repeats: [number, number, number];
  speeds: [number, number, number];
};

export type SpeechComparison = {
  referenceWords: string[];
  spokenWords: string[];
  missingWords: string[];
  differentWords: string[];
  matchedWords: string[];
  accuracy: number;
};

export type LocalRecording = {
  id: string;
  uri: string | null;
  storage: "capacitor-filesystem" | "opfs" | "indexeddb" | "memory";
  mimeType: string;
  durationSeconds: number;
};

export const DEFAULT_LEARNING_PRESETS: LearningPresetOptions = {
  repeats: [1, 3, 5],
  speeds: [0.75, 1, 1.25],
};

const PRESET_KEY = "loopine:learning-presets:v1";
const RECENT_ENTRY_KEY = "loopine:recent-learning-entry:v1";

function validUnique(values: unknown, min: number, max: number): number[] | null {
  if (!Array.isArray(values) || values.length !== 3) return null;
  const numbers = values.map(Number);
  if (numbers.some((value) => !Number.isFinite(value) || value < min || value > max)) return null;
  if (new Set(numbers).size !== 3) return null;
  return numbers;
}

export function readLearningPresets(): LearningPresetOptions {
  if (typeof window === "undefined") return DEFAULT_LEARNING_PRESETS;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRESET_KEY) || "null") as Partial<LearningPresetOptions> | null;
    const repeats = validUnique(parsed?.repeats, 1, 20);
    const speeds = validUnique(parsed?.speeds, 0.5, 2);
    if (!repeats || !speeds) return DEFAULT_LEARNING_PRESETS;
    return { repeats: repeats as [number, number, number], speeds: speeds as [number, number, number] };
  } catch {
    return DEFAULT_LEARNING_PRESETS;
  }
}

export function saveLearningPresets(value: LearningPresetOptions) {
  window.localStorage.setItem(PRESET_KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("loopine:learning-presets", { detail: value }));
}

export function saveRecentLearningEntry(entry: LearningSessionEntry) {
  if (typeof window === "undefined") return;
  const serializable = { ...entry, content: entry.content || null, savedAt: Date.now() };
  window.localStorage.setItem(RECENT_ENTRY_KEY, JSON.stringify(serializable));
}

export function readRecentLearningEntry(): LearningSessionEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(RECENT_ENTRY_KEY) || "null") as LearningSessionEntry | null;
    return value?.contentId || value?.youtubeUrl ? value : null;
  } catch {
    return null;
  }
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function compareSpeech(reference: string, spoken: string): SpeechComparison {
  const referenceWords = words(reference);
  const spokenWords = words(spoken);
  const remaining = [...spokenWords];
  const matchedWords: string[] = [];
  const missingWords: string[] = [];

  for (const word of referenceWords) {
    const index = remaining.indexOf(word);
    if (index >= 0) {
      matchedWords.push(word);
      remaining.splice(index, 1);
    } else {
      missingWords.push(word);
    }
  }

  const accuracy = referenceWords.length ? Math.round((matchedWords.length / referenceWords.length) * 100) : 0;
  return {
    referenceWords,
    spokenWords,
    missingWords,
    differentWords: remaining,
    matchedWords,
    accuracy,
  };
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function saveToIndexedDb(id: string, blob: Blob): Promise<LocalRecording> {
  if (!("indexedDB" in window)) {
    return { id, uri: URL.createObjectURL(blob), storage: "memory", mimeType: blob.type, durationSeconds: 0 };
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("loopine-recordings", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const transaction = request.result.transaction("recordings", "readwrite");
      transaction.objectStore("recordings").put(blob, id);
      transaction.oncomplete = () => { request.result.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  });
  return { id, uri: null, storage: "indexeddb", mimeType: blob.type, durationSeconds: 0 };
}

export async function saveRecordingOnDevice(blob: Blob, durationSeconds: number): Promise<LocalRecording> {
  const id = crypto.randomUUID();
  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (capacitor?.isNativePlatform?.()) {
    try {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      const path = `recordings/${id}.${extension}`;
      await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Data, recursive: true });
      const uri = await Filesystem.getUri({ path, directory: Directory.Data });
      return { id, uri: uri.uri, storage: "capacitor-filesystem", mimeType: blob.type, durationSeconds };
    } catch {
      // A native build without the Filesystem plugin still keeps the recording in IndexedDB.
    }
  }

  const storageManager = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (storageManager.getDirectory) {
    try {
      const root = await storageManager.getDirectory();
      const directory = await root.getDirectoryHandle("loopine-recordings", { create: true });
      const file = await directory.getFileHandle(`${id}.webm`, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      return { id, uri: null, storage: "opfs", mimeType: blob.type, durationSeconds };
    } catch {
      // Safari versions without OPFS write support fall through to IndexedDB.
    }
  }
  const saved = await saveToIndexedDb(id, blob);
  return { ...saved, durationSeconds };
}

export function routineLabel(step?: RoutineStep | null) {
  if (step === "MORNING_COMMUTE") return "출근 프리셋";
  if (step === "LUNCH") return "점심 프리셋";
  if (step === "EVENING_COMMUTE") return "퇴근 프리셋";
  if (step === "NIGHT_VOICE") return "밤 대화 프리셋";
  return "자율 학습";
}

