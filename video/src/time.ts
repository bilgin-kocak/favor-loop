// One clock for every scene: absolute seconds from src/timeline.json (the soundtrack reads the same file).
import { useCurrentFrame } from "remotion";
import timeline from "./timeline.json";

export const T = timeline;
export const FPS = T.fps;
export const B = T.beats;
export const S = T.scenes as unknown as Record<string, [number, number]>;
export const DROP = T.drop;

export const useSeconds = () => useCurrentFrame() / FPS;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 before a, 1 after b, linear between. */
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
/** A springy 0 -> 1 (with a little overshoot) starting at `at`. */
export const pop = (t: number, at: number, dur = 0.45) => {
  const x = clamp01((t - at) / dur);
  if (x <= 0) return 0;
  return 1 + Math.exp(-6 * x) * Math.cos(9 * x) * -1;
};
/** Visible between start and end, fading over `fade` seconds at both edges. */
export const windowed = (t: number, start: number, end: number, fade = 0.35) =>
  Math.min(ramp(t, start, start + fade), 1 - ramp(t, end - fade, end));
export const phrase = (vo: keyof typeof T.vo, i: number) => T.vo[vo].phrases[i];
