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

/**
 * The native Filesystem plugin, reached through the Capacitor bridge at runtime.
 *
 * Deliberately not `import("@capacitor/filesystem")`: the native shell loads this web
 * app from a remote URL (`server.url` in capacitor.config.json) and registers its
 * native plugins on `window.Capacitor.Plugins`, so the JS wrapper never needs to be in
 * the web bundle. Importing it would also make the web build fail wherever the package
 * is not installed — the dev container keeps its own node_modules.
 */
type NativeFilesystem = {
  writeFile(options: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }>;
  readFile(options: { path: string; directory: string }): Promise<{ data: string | Blob }>;
  stat(options: { path: string; directory: string }): Promise<{ size: number }>;
  getUri(options: { path: string; directory: string }): Promise<{ uri: string }>;
  deleteFile(options: { path: string; directory: string }): Promise<void>;
};

/** Capacitor's `Directory.Data`: iOS Documents, Android getFilesDir(). */
const NATIVE_DIRECTORY = "DATA";

function nativeFilesystem(): NativeFilesystem | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as typeof window & {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
  }).Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  return (capacitor.Plugins?.Filesystem as NativeFilesystem | undefined) ?? null;
}

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

type StoredRecording = { buffer: ArrayBuffer; mimeType: string; size: number; createdAt: number };

function openRecordingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open("loopine-recordings", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("recordings")) request.result.createObjectStore("recordings");
    };
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Recordings go into IndexedDB as an ArrayBuffer plus the recorded MIME type.
 * Storing a Blob directly is unreliable on iOS WebKit: the write reports success and
 * the value reads back unusable later, which is indistinguishable from "audio gone".
 */
async function saveToIndexedDb(id: string, blob: Blob): Promise<void> {
  const record: StoredRecording = {
    buffer: await blob.arrayBuffer(),
    mimeType: blob.type || "audio/webm",
    size: blob.size,
    createdAt: Date.now(),
  };
  const database = await openRecordingDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("recordings", "readwrite");
      transaction.objectStore("recordings").put(record, id);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB write aborted"));
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB write failed"));
    });
  } finally {
    database.close();
  }
}

/**
 * Ask the browser to keep this origin's data. Mobile browsers evict best-effort
 * storage under pressure, which is one way a saved recording disappears.
 */
async function requestPersistentStorage() {
  try {
    const manager = navigator.storage as StorageManager & { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
    if (!manager?.persist || !manager.persisted) return;
    if (await manager.persisted()) return;
    await manager.persist();
  } catch {
    // Persistence is an optimisation, never a requirement.
  }
}

async function saveToOpfs(id: string, blob: Blob): Promise<void> {
  const storageManager = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
  if (!storageManager?.getDirectory) throw new Error("OPFS is unavailable");
  const root = await storageManager.getDirectory();
  const directory = await root.getDirectoryHandle("loopine-recordings", { create: true });
  const file = await directory.getFileHandle(`${id}.${recordingExtension(blob.type)}`, { create: true });
  // Safari implements getDirectory() but not createWritable(), so this throws there
  // and the caller falls through to IndexedDB.
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Confirm the store really holds the recording, byte for byte. A store that accepts a
 * write and returns nothing (or a truncated file) must not count as saved.
 */
async function verifySavedRecording(
  id: string,
  storage: LocalRecording["storage"],
  expectedSize: number
): Promise<boolean> {
  if (storage === "capacitor-filesystem") {
    const filesystem = nativeFilesystem();
    if (!filesystem) return false;
    for (const extension of RECORDING_EXTENSIONS) {
      try {
        const stat = await filesystem.stat({ path: `recordings/${id}.${extension}`, directory: NATIVE_DIRECTORY });
        return stat.size === expectedSize;
      } catch {
        // Try the next container format.
      }
    }
    return false;
  }

  // Check the exact store that was written, not the fallback chain.
  const stored = storage === "indexeddb" ? await readFromIndexedDb(id) : await readFromOpfs(id);
  return Boolean(stored && stored.size === expectedSize);
}

async function saveToNativeFilesystem(id: string, blob: Blob): Promise<string> {
  const filesystem = nativeFilesystem();
  if (!filesystem) throw new Error("Native filesystem is unavailable");
  const path = `recordings/${id}.${recordingExtension(blob.type)}`;
  await filesystem.writeFile({ path, data: await blobToBase64(blob), directory: NATIVE_DIRECTORY, recursive: true });
  const uri = await filesystem.getUri({ path, directory: NATIVE_DIRECTORY });
  return uri.uri;
}

/**
 * Store a recording on this device, trying each store in turn and **verifying the
 * bytes read back** before reporting success. A store that accepts a write and then
 * cannot return it (iOS WebKit does this with Blobs in IndexedDB) must not be
 * recorded as a playable recording, or the review tab shows audio that is not there.
 *
 * When no store works the returned recording has an empty id, which the caller must
 * persist as `local_recording_id: null` so the record stays honest.
 */
export async function saveRecordingOnDevice(blob: Blob, durationSeconds: number): Promise<LocalRecording> {
  const mimeType = blob.type || "audio/webm";
  const failed: LocalRecording = { id: "", uri: null, storage: "memory", mimeType, durationSeconds };
  // An empty recording is never worth storing: it cannot be played or transcribed.
  if (!blob.size) return failed;

  await requestPersistentStorage();

  const capacitor = (window as typeof window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  const attempts: Array<{ storage: LocalRecording["storage"]; write: (id: string) => Promise<string | null> }> = [];
  if (capacitor?.isNativePlatform?.()) {
    attempts.push({ storage: "capacitor-filesystem", write: (id) => saveToNativeFilesystem(id, blob) });
  }
  attempts.push({ storage: "opfs", write: async (id) => { await saveToOpfs(id, blob); return null; } });
  attempts.push({ storage: "indexeddb", write: async (id) => { await saveToIndexedDb(id, blob); return null; } });

  for (const attempt of attempts) {
    const id = crypto.randomUUID();
    try {
      const uri = await attempt.write(id);
      if (!(await verifySavedRecording(id, attempt.storage, blob.size))) {
        throw new Error(`${attempt.storage} did not return the recording it accepted`);
      }
      return { id, uri, storage: attempt.storage, mimeType, durationSeconds };
    } catch {
      // Try the next store. Nothing is reported as saved until it reads back intact.
    }
  }
  return failed;
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
  let database: IDBDatabase;
  try {
    database = await openRecordingDb();
  } catch {
    return null;
  }
  try {
    if (!database.objectStoreNames.contains("recordings")) return null;
    const value = await new Promise<unknown>((resolve) => {
      const read = database.transaction("recordings", "readonly").objectStore("recordings").get(id);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => resolve(null);
    });
    if (!value) return null;
    // Rows written before the ArrayBuffer change hold a Blob directly.
    if (value instanceof Blob) return value.size ? value : null;
    const record = value as Partial<StoredRecording>;
    if (!record.buffer || !(record.buffer as ArrayBuffer).byteLength) return null;
    return new Blob([record.buffer], { type: record.mimeType || "audio/webm" });
  } catch {
    return null;
  } finally {
    database.close();
  }
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

function base64ToBlob(value: string, mimeType: string): Blob {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Read a recording stored by the native app through the Filesystem plugin.
 *
 * The bytes are returned rather than a file URI on purpose. The native shell loads the
 * web app from a remote https origin (`server.url` in capacitor.config.json), so the
 * `capacitor://localhost/_capacitor_file_/…` and `http://localhost/_capacitor_file_/…`
 * URLs that `convertFileSrc` produces are cross-origin — and on Android also mixed
 * content — and the WebView refuses to play them. A same-origin blob URL always works.
 */
async function readFromNativeFilesystem(id: string): Promise<Blob | null> {
  const filesystem = nativeFilesystem();
  if (!filesystem) return null;
  for (const extension of RECORDING_EXTENSIONS) {
    const path = `recordings/${id}.${extension}`;
    try {
      const file = await filesystem.readFile({ path, directory: NATIVE_DIRECTORY });
      const data = file.data;
      if (typeof data !== "string" || !data) continue;
      const blob = base64ToBlob(data, RECORDING_MIME_BY_EXTENSION[extension] || "audio/mp4");
      if (blob.size) return blob;
    } catch {
      // Try the next container format.
    }
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
    const nativeBlob = await readFromNativeFilesystem(localRecordingId);
    if (nativeBlob) {
      return {
        status: "found",
        url: URL.createObjectURL(nativeBlob),
        revoke: true,
        mimeType: nativeBlob.type || "audio/mp4",
      };
    }
    // The native shell may have fallen back to a web store for this recording.
    const webBlob = (await readFromOpfs(localRecordingId)) || (await readFromIndexedDb(localRecordingId));
    return webBlob
      ? { status: "found", url: URL.createObjectURL(webBlob), revoke: true, mimeType: webBlob.type || "audio/mp4" }
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
      const filesystem = nativeFilesystem();
      if (!filesystem) return;
      for (const extension of RECORDING_EXTENSIONS) {
        try {
          await filesystem.deleteFile({ path: `recordings/${localRecordingId}.${extension}`, directory: NATIVE_DIRECTORY });
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
