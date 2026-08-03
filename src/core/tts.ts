// Web Speech API Utility for Japanese Pronunciation

export function speakJapanese(text: string): void {
  if (!("speechSynthesis" in window)) {
    console.warn("Speech Synthesis is not supported in this browser environment.");
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 0.9; // Slightly slower for clear learning pronunciation

  // Try to pick a native Japanese voice if available
  const voices = window.speechSynthesis.getVoices();
  const japaneseVoice = voices.find(
    (voice) => voice.lang.includes("ja") || voice.lang.includes("JP")
  );

  if (japaneseVoice) {
    utterance.voice = japaneseVoice;
  }

  window.speechSynthesis.speak(utterance);
}
