// A share's hourly candles aligned to the regular session (9:30 to 16:00 New
// York), built from 30-minute bars, which start on the half hour: 9:30-10:30,
// 10:30-11:30 ... 15:30-16:00 for one-hour candles; 9:30-11:30 ... for two;
// 9:30-13:30 and 13:30-16:00 for four. Bars outside the session are left out.
// Pure; functions/terminal fetches the bars (sessionHours).

const NY_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function nyMinutes(ms: number): number {
  const p = Object.fromEntries(NY_CLOCK.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

export const OPEN = 9 * 60 + 30;
export const CLOSE = 16 * 60;

type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };

export function sessionCandles(halves: Bar[], spanMinutes: number) {
  const out: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (const b of halves) {
    const ms = Date.parse(b.t);
    const m = nyMinutes(ms);
    if (m < OPEN || m >= CLOSE) continue;
    const time = Math.floor(ms / 1000) - ((m - OPEN) % spanMinutes) * 60;
    const last = out.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, b.h);
      last.low = Math.min(last.low, b.l);
      last.close = b.c;
      last.volume += b.v;
    } else {
      out.push({ time, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    }
  }
  return out;
}
