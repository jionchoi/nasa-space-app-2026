// "Speak" as an answer to "Are you OK?": listens to the microphone only while the check-in is showing and
// reports when the sound level stays above voice_level for voice_min_s. Only a loudness number is computed;
// nothing is recorded, stored or sent.

/** Starts listening; calls `onVoice` once when someone speaks. Returns a function that stops listening. */
export async function listenForVoice(level: number, minSeconds: number, onVoice: () => void): Promise<() => void> {
  // No microphone API (or no permission): nothing to listen to; tap, key and hand movement still work.
  if (!navigator.mediaDevices?.getUserMedia) return () => {};
  let stream: MediaStream;
  try {
    // Echo cancellation removes most of the check-in beep from the microphone. A beep (0.18 s) is also shorter
    // than voice_min_s, so the beep alone never counts as speaking.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  } catch {
    return () => {};
  }
  // An analyser gives the sound wave in small chunks; we only compute its loudness (RMS).
  const audio = new AudioContext();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 1024;
  audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let loudSince: number | null = null;

  // Check the level 20 times a second.
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    const now = performance.now() / 1000;
    // Loud enough: start (or keep) counting; quiet: start over.
    loudSince = rms >= level ? loudSince ?? now : null;
    if (loudSince !== null && now - loudSince >= minSeconds) {
      stop();
      onVoice();
    }
  }, 50);

  // Release the microphone (its indicator goes off) and the audio context.
  function stop() {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    void audio.close();
  }
  return stop;
}
