// The whole film: one background, every scene on the absolute clock, captions, voice, sound effects and the soundtrack.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Background, C, Caption } from "./components";
import { CROSS_AT, HookAndPuzzle, Kidney, Title } from "./scenes1";
import { Agent, Close, Kismet, Proof, Scale, Yeses } from "./scenes2";
import { B, DROP, FPS, T, clamp01, phrase, ramp, useSeconds } from "./time";

type Cue = { at: number; sfx: string; volume: number; seconds?: number };
const cue = (at: number, sfx: string, volume: number, seconds?: number): Cue => ({ at, sfx, volume, seconds });

const SFX: Cue[] = [
  // three people, zero trades
  cue(0.25, "ping1", 0.8), cue(0.55, "ping2", 0.8), cue(0.85, "ping3", 0.8),
  cue(phrase("vo02", 0).start, "pop1", 0.4), cue(phrase("vo02", 2).start, "pop2", 0.4), cue(phrase("vo02", 4).start, "pop3", 0.4),
  ...CROSS_AT.map(at => cue(at, "denied", 0.22, 0.8)),
  // the loop closes, the drop
  cue(15.75, "ping1", 0.6), cue(16.25, "ping2", 0.6), cue(16.75, "ping3", 0.6),
  cue(DROP - 1.83, "riser", 0.2),
  cue(DROP, "ring", 0.75), cue(DROP, "sting", 0.4),
  // kidney exchange
  cue(21.3, "pop1", 0.3), cue(21.6, "pop2", 0.3), cue(21.9, "pop3", 0.3),
  cue(22.6, "denied", 0.16, 0.8),
  cue(25.45, "ring", 0.4),
  cue(26.4, "ping1", 0.45), cue(27.0, "ping2", 0.45), cue(27.6, "ping3", 0.45),
  cue(28.8, "whoosh", 0.22),
  // the agent session
  cue(31.0, "pop1", 0.3),
  cue(phrase("vo07", 0).start + 0.05, "pop2", 0.3),
  cue(phrase("vo07", 1).start + 0.05, "pop1", 0.3),
  cue(37.4, "typing", 0.2, 1.3),
  cue(phrase("vo07", 2).start + 0.1, "ping2", 0.55),
  cue(phrase("vo07", 3).start - 0.05, "success", 0.4),
  // everyone says yes
  cue(41.8, "buzz", 0.07, 0.45),
  cue(B.yes1, "pop1", 0.5), cue(B.yes2, "pop2", 0.5), cue(B.yes3, "pop3", 0.5),
  cue(B.accepted, "success", 0.6), cue(B.accepted, "ring", 0.35),
  // the proof
  cue(phrase("vo09", 0).start, "pop1", 0.35), cue(phrase("vo09", 1).start, "pop2", 0.35), cue(phrase("vo09", 2).start, "pop3", 0.35),
  cue(53.3, "ping1", 0.7), cue(54.1, "ping2", 0.7), cue(54.9, "ping3", 0.7),
  cue(B.proofRing, "ring", 0.7),
  // the simulated village, Kismet
  cue(56.75, "whoosh", 0.28),
  cue(57.6, "pop1", 0.25), cue(58.7, "pop2", 0.25), cue(59.9, "pop3", 0.25),
  cue(65.15, "whoosh", 0.22),
  cue(phrase("vo11", 3).start + 1.0, "ping3", 0.5),
  // the close
  cue(75.95, "ping1", 0.45), cue(76.3, "ping2", 0.45), cue(76.65, "ping3", 0.45),
  cue(B.finalHit, "ring", 0.8), cue(B.finalHit, "sting", 0.5), cue(B.finalHit, "ring_long", 0.45),
];

// The music ducks under every spoken phrase and opens up between them, at the drop and after the final hit.
const SPEECH = Object.values(T.vo).flatMap(v => v.phrases.map(p => [p.start, p.end] as const));
const S_KISMET = T.scenes.kismet as [number, number];
export const musicGain = (t: number) => {
  let gap = Infinity;
  for (const [s, e] of SPEECH) gap = Math.min(gap, t < s ? s - t : t > e ? t - e : 0);
  const duck = 0.28 + 0.72 * clamp01((gap - 0.1) / 0.3);
  const base = t < DROP ? 0.5 : t >= S_KISMET[0] && t < S_KISMET[1] ? 0.32 : 0.25;
  const open = (t >= DROP && t < DROP + 3.6) || t >= B.finalHit ? 2 : 1;
  return Math.min(1, base * duck * open) * (1 - ramp(t, T.duration - 1.2, T.duration));
};

export const FavorLoop: React.FC = () => {
  const t = useSeconds();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background t={t} />
      <HookAndPuzzle t={t} />
      <Title t={t} />
      <Kidney t={t} />
      <Agent t={t} />
      <Yeses t={t} />
      <Proof t={t} />
      <Scale t={t} />
      <Kismet t={t} />
      <Close t={t} />
      <Caption t={t} hidden={["vo01", "vo11", "vo12", "vo10.0", "vo10.1", "vo10.2"]} />
      <AbsoluteFill style={{ background: "#000", opacity: ramp(t, T.duration - 0.6, T.duration) }} />

      <Audio src={staticFile("audio/music.wav")} volume={f => musicGain(f / FPS)} />
      {Object.entries(T.vo).map(([name, vo]) => (
        <Sequence key={name} from={Math.round(vo.start * FPS)} durationInFrames={Math.ceil((vo.duration + 0.3) * FPS)} layout="none">
          <Audio src={staticFile(vo.file)} />
        </Sequence>
      ))}
      {SFX.map((c, i) => (
        <Sequence key={i} from={Math.round(c.at * FPS)} durationInFrames={c.seconds ? Math.round(c.seconds * FPS) : undefined} layout="none">
          <Audio src={staticFile(`audio/use/sfx_${c.sfx}.mp3`)} volume={c.seconds ? f => c.volume * clamp01((c.seconds! * FPS - f) / (0.15 * FPS)) : c.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
