let context: AudioContext | null = null;

function tone(frequency: number, duration: number, gainValue: number) {
  const audio = context ?? new AudioContext();
  context = audio;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.value = gainValue;
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

export function beepForStatus(status: string) {
  if (status === "expired") {
    tone(196, 0.16, 0.05);
    return;
  }
  if (status === "today" || status === "critical") {
    tone(440, 0.1, 0.04);
    return;
  }
  if (status === "missing") {
    tone(280, 0.08, 0.03);
    return;
  }
  tone(880, 0.07, 0.035);
}
