/**
 * 브라우저 TTS(「발음 듣기」).
 *
 * `utterance.lang = "en-US"` 만 지정하면 브라우저는 기본 목소리를 그대로 쓰는
 * 경우가 많다. 한국어 로케일 기기에서 그 기본값은 한국어 엔진이라, 영어 문장을
 * 한국어 음성으로 읽으며 쉰 목소리처럼 뭉개진다. 실제 영어 목소리를
 * `utterance.voice` 에 붙여야 한다.
 *
 * 두 가지 함정이 더 있다.
 * - `getVoices()` 는 Chrome 에서 첫 호출 때 빈 배열을 준다(`voiceschanged` 이후
 *   채워짐). 그래서 목록이 비어 있으면 기다렸다 말한다.
 * - `cancel()` 직후 같은 틱에 `speak()` 하면 Chrome 에서 말이 잘리거나 뭉개진다.
 *   재생 중이던 경우에만 한 프레임 이상 띄운다.
 *
 * iOS Safari 는 사용자 제스처 안에서 시작한 speak() 만 허용하는 판이 있어,
 * 목소리 목록이 이미 있으면 await 없이 동기로 말한다.
 */

/** 자연스러운 순서. 앞쪽이 대체로 사람 목소리에 가깝다. */
const PREFERRED_VOICE_NAMES = [
  "Google US English",
  "Samantha",
  "Ava",
  "Allison",
  "Alex",
  "Google UK English Female",
  "Daniel",
  "Karen",
  "Moira",
];

/** 이상한 기계음/변조/괴물/속삭임 등 학습에 부적합한 Mac/iOS 특수 효과 목소리 제외 */
const EXCLUDED_VOICE_NAMES = [
  "whisper",
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "pipe organ",
  "trinoids",
  "zarvox",
  "jester",
  "junior",
  "organ",
  "superstar",
  "wobble",
  "ralph",
  "fred",
];

const VOICE_LOAD_TIMEOUT_MS = 1200;
const RESTART_DELAY_MS = 120;

let cachedVoice: SpeechSynthesisVoice | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

export function isSpeechSupported(): boolean {
  return synth() !== null;
}

export function cancelSpeech(): void {
  try {
    synth()?.cancel();
  } catch {
    // 일부 브라우저는 재생 중이 아닐 때 cancel() 에서 던진다.
  }
}

/**
 * 목소리 목록 중 영어를 고른다.
 *
 * 테스트를 위해 내보낸다. 이 선택이 곧 "쉰 목소리" 및 "귀신 목소리" 를 막는 지점이다.
 */
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((voice) => {
    if (!voice.lang?.toLowerCase().startsWith("en")) return false;
    const nameLower = voice.name?.toLowerCase() || "";
    return !EXCLUDED_VOICE_NAMES.some((excluded) => nameLower.includes(excluded));
  });
  if (!english.length) return null;

  // iOS/macOS 는 기본(사전 설치) 목소리를 voiceURI 에 `compact` 로 표시한다.
  const fullQuality = english.filter((voice) => !voice.voiceURI?.includes("compact"));

  // 1. 선호 목록 중 고품질(non-compact) 목소리가 있으면 최우선 선택
  for (const name of PREFERRED_VOICE_NAMES) {
    const match = fullQuality.find((voice) => voice.name?.includes(name));
    if (match) return match;
  }

  // 2. 고품질 선호 목소리가 없더라도, compact 선호 목소리(Samantha, Ava, Daniel 등)가
  //    생소한 비-compact 목소리나 시스템 대체 음성보다 훨씬 자연스럽다.
  for (const name of PREFERRED_VOICE_NAMES) {
    const match = english.find((voice) => voice.name?.includes(name));
    if (match) return match;
  }

  // 3. 선호 목록에 없는 경우, en-US 우선 선택
  const normalized = (value: string) => value.replace("_", "-").toLowerCase();
  const pool = fullQuality.length ? fullQuality : english;
  return pool.find((voice) => normalized(voice.lang) === "en-us") || pool[0] || english[0];
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const speech = synth();
  if (!speech) return Promise.resolve([]);

  const ready = speech.getVoices();
  if (ready.length) return Promise.resolve(ready);
  if (voicesPromise) return voicesPromise;

  voicesPromise = new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      speech.removeEventListener("voiceschanged", finish);
      voicesPromise = null;
      resolve(speech.getVoices());
    };
    // voiceschanged 를 보내지 않는 브라우저도 있어 기다림을 끊는다.
    const timer = window.setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
    speech.addEventListener("voiceschanged", finish);
  });
  return voicesPromise;
}

function buildUtterance(text: string, voices: SpeechSynthesisVoice[], rate: number) {
  if (!cachedVoice || !voices.includes(cachedVoice)) {
    cachedVoice = pickEnglishVoice(voices);
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = cachedVoice;
  utterance.lang = cachedVoice?.lang || "en-US";
  utterance.rate = Math.max(0.5, Math.min(1.5, rate));
  utterance.pitch = 1;
  utterance.volume = 1;
  return utterance;
}

function speakNow(speech: SpeechSynthesis, text: string, voices: SpeechSynthesisVoice[], rate: number) {
  const wasBusy = speech.speaking || speech.pending;
  cancelSpeech();
  const utterance = buildUtterance(text, voices, rate);
  utterance.onend = () => {
    if (activeUtterance === utterance) activeUtterance = null;
  };
  utterance.onerror = () => {
    if (activeUtterance === utterance) activeUtterance = null;
  };
  activeUtterance = utterance;
  if (wasBusy) {
    window.setTimeout(() => speech.speak(utterance), RESTART_DELAY_MS);
  } else {
    speech.speak(utterance);
  }
}

/** 영어 문장을 기기 TTS 로 읽는다. 지원하지 않으면 false. */
export function speakEnglish(text: string, options: { rate?: number } = {}): boolean {
  const speech = synth();
  const value = text.trim();
  if (!speech || !value) return false;

  const rate = options.rate ?? 0.9;
  const ready = speech.getVoices();
  if (ready.length) {
    speakNow(speech, value, ready, rate);
    return true;
  }
  // 첫 호출에서는 목록이 비어 있을 수 있다. 채워지는 즉시 말한다.
  void loadVoices().then((loaded) => speakNow(speech, value, loaded, rate));
  return true;
}
