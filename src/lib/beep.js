// Short loud alert tone sequence using the Web Audio API (no asset needed).
export function playAlert(times = 4) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  for (let i = 0; i < times; i++) {
    const start = ctx.currentTime + i * 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = i % 2 === 0 ? 880 : 1180;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  }
  setTimeout(() => ctx.close(), times * 400 + 500);
}