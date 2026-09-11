/**
 * 「발음 듣기」가 영어 목소리를 고르는지.
 *
 * 한국어 로케일 기기에서는 기본 목소리가 한국어다. `utterance.lang` 만 지정하면
 * 브라우저가 그 기본값을 그대로 쓰는 경우가 많아, 영어 문장을 한국어 엔진이
 * 읽으며 쉰 목소리처럼 뭉개진다. 그 회귀를 여기서 막는다.
 */

import { describe, expect, it } from "vitest";
import { pickEnglishVoice } from "@/lib/speech";

function voice(name: string, lang: string, voiceURI = name): SpeechSynthesisVoice {
  return { name, lang, voiceURI, default: false, localService: true } as SpeechSynthesisVoice;
}

describe("pickEnglishVoice", () => {
  it("한국어 기본 목소리 대신 영어 목소리를 고른다", () => {
    const voices = [
      voice("Yuna", "ko-KR"),
      voice("Google 한국의", "ko-KR"),
      voice("Samantha", "en-US"),
    ];
    expect(pickEnglishVoice(voices)?.name).toBe("Samantha");
  });

  it("compact(저품질) 목소리보다 일반 목소리를 고른다", () => {
    const voices = [
      voice("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel"),
      voice("Karen", "en-AU", "com.apple.voice.enhanced.en-AU.Karen"),
    ];
    expect(pickEnglishVoice(voices)?.name).toBe("Karen");
  });

  it("compact 뿐이면 그거라도 고른다", () => {
    const voices = [voice("Daniel", "en-GB", "com.apple.voice.compact.en-GB.Daniel")];
    expect(pickEnglishVoice(voices)?.name).toBe("Daniel");
  });

  it("선호 목록에 없으면 en-US 를 먼저 고른다", () => {
    const voices = [voice("Nicky", "en-GB"), voice("Aaron", "en-US")];
    expect(pickEnglishVoice(voices)?.name).toBe("Aaron");
  });

  it("영어 목소리가 없으면 null — 한국어 목소리로 영어를 읽히지 않는다", () => {
    expect(pickEnglishVoice([voice("Yuna", "ko-KR")])).toBeNull();
  });

  it("lang 표기가 en_US 처럼 밑줄이어도 알아본다", () => {
    const voices = [voice("Nicky", "en-GB"), voice("Aaron", "en_US")];
    expect(pickEnglishVoice(voices)?.name).toBe("Aaron");
  });

  it("Whisper, Albert 등 특수효과/귀신 목소리가 비-compact 여도 compact 기본 영어 목소리를 우선 선택한다", () => {
    const voices = [
      voice("Samantha", "en-US", "com.apple.voice.compact.en-US.Samantha"),
      voice("Whisper", "en-US", "com.apple.speech.synthesis.voice.Whisper"),
      voice("Albert", "en-US", "com.apple.speech.synthesis.voice.Albert"),
      voice("Zarvox", "en-US", "com.apple.speech.synthesis.voice.Zarvox"),
    ];
    expect(pickEnglishVoice(voices)?.name).toBe("Samantha");
  });

  it("특수효과/귀신 목소리만 있으면 null 을 반환하여 브라우저 기본값에 맡긴다", () => {
    const voices = [
      voice("Whisper", "en-US", "com.apple.speech.synthesis.voice.Whisper"),
      voice("Albert", "en-US", "com.apple.speech.synthesis.voice.Albert"),
    ];
    expect(pickEnglishVoice(voices)).toBeNull();
  });
});
