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

/**
 * MediaRecorder emits webm/opus on Chrome and Firefox but mp4/aac on Safari and iOS,
 * so the container has to be part of the stored file name. Reading a file back gives
 * a MIME type inferred from that name only, which is why the two tables must agree:
 * a mp4 payload stored as ".webm" comes back as "video/webm" and will not decode.
 */
const RECORDING_EXTENSIONS = ["webm", "m4a", "mp4", "ogg", "mp3", "wav"] as const;

const RECORDING_MIME_BY_EXTENSION: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export function recordingExtension(mimeType: string | null | undefined): string {
  const type = (mimeType || "").toLowerCase();
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac") || type.includes("x-m4a")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "webm";
}

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
      const path = `recordings/${id}.${recordingExtension(blob.type)}`;
      await Filesystem.writeFile({ path, data: await blobToBase64(blob), directory: Directory.Data, recursive: true });
      const uri = await Filesystem.getUri({ path, directory: Directory.Data });
      return { id, uri: uri.uri, storage: "capacitor-filesystem", mimeType: blob.type, durationSeconds };
    } catch {
      // A native build without the Filesystem plugin still keeps the recording in IndexedDB.
    }
  }

  const storageManager = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (storageManager?.getDirectory) {
    try {
      const root = await storageManager.getDirectory();
      const directory = await root.getDirectoryHandle("loopine-recordings", { create: true });
      const file = await directory.getFileHandle(`${id}.${recordingExtension(blob.type)}`, { create: true });
      const writable = await file.createWritable();
      await writable.write(blob);
      await writable.close();
      // Read the file back: a write that reports success but stores nothing would
      // otherwise be recorded as a playable recording that can never be found.
      const written = await file.getFile();
      if (written.size !== blob.size) throw new Error("OPFS write was truncated");
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


export type LocalRecordingMissingReason =
  /** No local audio was ever recorded for this attempt (server record only). */
  | "never-saved"
  /** An id was recorded, but this browser profile has no such file: another device,
   *  another origin, or the browser cleared its site data. */
  | "not-on-this-device";

export type LocalRecordingLookup =
  | { status: "found"; url: string; revoke: boolean; mimeType: string }
  | { status: "missing"; reason: LocalRecordingMissingReason }
  | { status: "unsupported" };

async function readFromIndexedDb(id: string): Promise<Blob | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise<Blob | null>((resolve) => {
    const request = indexedDB.open("loopine-recordings", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("recordings")) request.result.createObjectStore("recordings");
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("recordings")) {
        database.close();
        resolve(null);
        return;
      }
      const read = database.transaction("recordings", "readonly").objectStore("recordings").get(id);
      read.onsuccess = () => { database.close(); resolve((read.result as Blob | undefined) || null); };
      read.onerror = () => { database.close(); resolve(null); };
    };
  });
}

async function readFromOpfs(id: string): Promise<Blob | null> {
  const storageManager = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (!storageManager?.getDirectory) return null;
  try {
    const root = await storageManager.getDirectory();
    const directory = await root.getDirectoryHandle("loopine-recordings");
    for (const extension of RECORDING_EXTENSIONS) {
      try {
        const handle = await directory.getFileHandle(`${id}.${extension}`);
        const file = await handle.getFile();
        if (!file.size) continue;
        // A File read from OPFS carries a type guessed from its name (a .webm name
        // becomes "video/webm"), so rebuild the blob with the audio type instead.
        return new Blob([file], { type: RECORDING_MIME_BY_EXTENSION[extension] || "audio/webm" });
      } catch {
        // Try the next container format.
      }
    }
  } catch {
    // The directory disappears when the browser clears site data.
  }
  return null;
}

async function readCapacitorUri(id: string): Promise<string | null> {
  const capacitor = (window as typeof window & {
    Capacitor?: { isNativePlatform?: () => boolean; convertFileSrc?: (value: string) => string };
  }).Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    for (const extension of RECORDING_EXTENSIONS) {
      try {
        // stat() first: getUri() builds a path string even when no file is there.
        await Filesystem.stat({ path: `recordings/${id}.${extension}`, directory: Directory.Data });
        const uri = await Filesystem.getUri({ path: `recordings/${id}.${extension}`, directory: Directory.Data });
        return capacitor.convertFileSrc?.(uri.uri) || uri.uri;
      } catch {
        // Try the next container format.
      }
    }
  } catch {
    // A native build without the Filesystem plugin has no local copy to resolve.
  }
  return null;
}

/**
 * Resolve a recording that was stored on this device by `saveRecordingOnDevice`.
 * Returns "missing" when the audio is gone (other device, cleared storage) so the
 * review tab can keep showing the STT comparison without an audio player.
 */
export async function loadRecordingFromDevice(
  localRecordingId: string | null,
  storage: string | null
): Promise<LocalRecordingLookup> {
  if (typeof window === "undefined") return { status: "unsupported" };
  // No id means the attempt was stored without local audio in the first place.
  if (!localRecordingId) return { status: "missing", reason: "never-saved" };
  // "memory" only ever existed in the page session that recorded it.
  if (storage === "memory") return { status: "missing", reason: "not-on-this-device" };

  if (storage === "capacitor-filesystem") {
    const uri = await readCapacitorUri(localRecordingId);
    return uri
      ? { status: "found", url: uri, revoke: false, mimeType: "" }
      : { status: "missing", reason: "not-on-this-device" };
  }

  // Try both web stores regardless of the recorded value: a browser can lose OPFS
  // write support between visits, and the recording may sit in the other store.
  const blob = storage === "indexeddb"
    ? (await readFromIndexedDb(localRecordingId)) || (await readFromOpfs(localRecordingId))
    : (await readFromOpfs(localRecordingId)) || (await readFromIndexedDb(localRecordingId));
  if (!blob) return { status: "missing", reason: "not-on-this-device" };
  return {
    status: "found",
    url: URL.createObjectURL(blob),
    revoke: true,
    mimeType: blob.type || "audio/webm",
  };
}


async function deleteFromIndexedDb(id: string) {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const request = indexedDB.open("loopine-recordings", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("recordings")) request.result.createObjectStore("recordings");
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("recordings")) {
        database.close();
        resolve();
        return;
      }
      const transaction = database.transaction("recordings", "readwrite");
      transaction.objectStore("recordings").delete(id);
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => { database.close(); resolve(); };
    };
  });
}

/**
 * Best-effort cleanup of a recording stored on this device. Called after the server
 * record is deleted, so a failure here must never surface as an error: the audio is
 * unreachable either way once its attempt row is gone.
 */
export async function deleteRecordingFromDevice(
  localRecordingId: string | null,
  storage: string | null
): Promise<void> {
  if (typeof window === "undefined" || !localRecordingId) return;
  try {
    if (storage === "capacitor-filesystem") {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      for (const extension of RECORDING_EXTENSIONS) {
        try {
          await Filesystem.deleteFile({ path: `recordings/${localRecordingId}.${extension}`, directory: Directory.Data });
        } catch {
          // The recording used a different container format.
        }
      }
      return;
    }

    const storageManager = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    if (storageManager?.getDirectory) {
      try {
        const root = await storageManager.getDirectory();
        const directory = await root.getDirectoryHandle("loopine-recordings");
        for (const extension of RECORDING_EXTENSIONS) {
          try {
            await directory.removeEntry(`${localRecordingId}.${extension}`);
          } catch {
            // The recording used a different container format.
          }
        }
      } catch {
        // No OPFS directory on this device.
      }
    }
    await deleteFromIndexedDb(localRecordingId);
  } catch {
    // Local cleanup is best effort only.
  }
}
