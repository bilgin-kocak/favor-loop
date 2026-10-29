// Scenes 1-5: the hook, the impossible trade, the loop, the title, and the kidney-exchange idea.
import React from "react";
import { AbsoluteFill, random } from "remotion";
import { Arrow, C, Chip, FONT, GlowDefs, PEOPLE, Ring, SideCard } from "./components";
import { B, DROP, S, clamp01, easeInOut, easeOut, phrase, pop, ramp, windowed } from "./time";

type Pt = { x: number; y: number };
const mix = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
const lerpColor = (a: string, b: string, u: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * clamp01(u))).join(",")})`;
};

// avatar centres of the three people; names and favors sit beside them, outside the triangle
export const TRI = { priya: { x: 960, y: 150 }, arjun: { x: 1290, y: 540 }, maya: { x: 630, y: 540 } };
const HOOK = { priya: { x: 960, y: 330 }, arjun: { x: 1110, y: 560 }, maya: { x: 810, y: 560 } };
const SIDE = { priya: "right", arjun: "right", maya: "left" } as const;
const RING = { cx: 960, cy: 485, r: 410 };

const appearAt = { priya: phrase("vo02", 0).start, arjun: phrase("vo02", 2).start, maya: phrase("vo02", 4).start };
const wantsAt = { priya: phrase("vo02", 1).start, arjun: phrase("vo02", 3).start + 0.9, maya: phrase("vo02", 5).start };
const PINGS = [0.25, 0.55, 0.85];

// the pairwise attempts: the direction that works (it is the loop) and the one that fails
const ATTEMPTS = [
  { ok: ["arjun", "priya", "📸"], bad: ["priya", "arjun"], okAt: 9.15, badAt: 9.55 },
  { ok: ["maya", "arjun", "🧘"], bad: ["arjun", "maya"], okAt: 10.9, badAt: 12.0 },
  { ok: ["priya", "maya", "💻"], bad: ["maya", "priya"], okAt: 12.35, badAt: 12.75 },
] as const;
export const CROSS_AT = ATTEMPTS.map(a => a.badAt + 0.3);
const GOLD_AT = { "priya-maya": 15.75, "maya-arjun": 16.25, "arjun-priya": 16.75 };

export const HookAndPuzzle: React.FC<{ t: number }> = ({ t }) => {
  if (t > DROP + 0.7) return null;
  const toTri = easeInOut(ramp(t, 3.4, 4.1));
  const textOpacity = 1 - ramp(t, 3.3, 3.8);
  const fadeAll = 1 - ramp(t, DROP + 0.25, DROP + 0.65);
  const crossesFade = 1 - ramp(t, 14.4, 14.9);
  const punch = 1 + 0.035 * Math.exp(-Math.max(0, t - DROP) * 6) * (t >= DROP ? 1 : 0);
  return (
    <AbsoluteFill style={{ opacity: fadeAll, transform: `scale(${punch})` }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <GlowDefs />
        {/* the waiting dots: each becomes a card when its person is introduced */}
        {(["priya", "arjun", "maya"] as const).map((k, i) => {
          const at = PINGS[i];
          const shown = pop(t, at, 0.4);
          const becomeCard = ramp(t, appearAt[k] - 0.05, appearAt[k] + 0.2);
          const pos = mix(HOOK[k], TRI[k], toTri);
          if (shown <= 0 || becomeCard >= 1) return null;
          return (
            <g key={k} opacity={1 - becomeCard}>
              <circle cx={pos.x} cy={pos.y} r={22 * shown} fill={C.gold} opacity={0.25} filter="url(#glow)" />
              <circle cx={pos.x} cy={pos.y} r={13 * shown} fill="#fff" />
            </g>
          );
        })}
        {/* the arrows of the puzzle */}
        {ATTEMPTS.map((at, i) => {
          const [from, to, label] = at.ok;
          const key = `${from}-${to}` as keyof typeof GOLD_AT;
          const okP = easeOut(ramp(t, at.okAt, at.okAt + 0.4));
          const gold = ramp(t, GOLD_AT[key], GOLD_AT[key] + 0.35);
          const badP = easeOut(ramp(t, at.badAt, at.badAt + 0.3));
          const crossT = t > CROSS_AT[i] ? t - CROSS_AT[i] : 0;
          const pulse = t > 13.58 && t < 14.4 ? 1 + 0.12 * Math.sin((t - 13.58) * 18) : 1;
          return (
            <g key={i}>
              <Arrow a={TRI[to]} b={TRI[from]} progress={badP} color={C.red} dashed width={5} cross={crossT} opacity={crossesFade * pulse > 0 ? crossesFade : 0} inset={92} />
              <Arrow a={TRI[from]} b={TRI[to]} progress={okP} color={lerpColor("#e8eefc", C.gold, gold)} width={6 + gold * 3} label={label} glow={gold > 0.05} inset={92} />
            </g>
          );
        })}
        {/* the snap */}
        {t >= DROP && <Ring cx={RING.cx} cy={RING.cy} r={RING.r} progress={easeOut(ramp(t, DROP, DROP + 0.22))} width={10} />}
      </svg>
      {(["priya", "arjun", "maya"] as const).map(k => (
        <SideCard key={k} p={PEOPLE[k]} x={TRI[k].x} y={TRI[k].y} side={SIDE[k]} lift={k === "priya" ? -20 : 0} appear={pop(t, appearAt[k], 0.5)}
          wantsAppear={pop(t, wantsAt[k], 0.45)} />
      ))}
      {/* the hook's words */}
      <div style={{ position: "absolute", top: 700, width: 1920, textAlign: "center", fontFamily: FONT, color: C.ink, opacity: textOpacity }}>
        <div style={{ fontSize: 92, fontWeight: 800, opacity: clamp01((t - phrase("vo01", 0).start) * 4), transform: `translateY(${(1 - easeOut(ramp(t, 0.62, 1.0))) * 30}px)` }}>
          3 people.
        </div>
        <div style={{ fontSize: 92, fontWeight: 800, opacity: clamp01((t - phrase("vo01", 1).start) * 4), transform: `translateY(${(1 - easeOut(ramp(t, 1.95, 2.33))) * 30}px)` }}>
          <span style={{ color: C.gold }}>0</span> possible trades.
        </div>
      </div>
      {/* the white flash of the snap */}
      {t >= DROP && <AbsoluteFill style={{ background: "#fff", opacity: 0.45 * (1 - ramp(t, DROP, DROP + 0.28)) }} />}
    </AbsoluteFill>
  );
};

/** The logo: a ring with three people on it and the favors flowing round. */
export const Logo: React.FC<{ cx: number; cy: number; r: number; progress: number; spin: number; dots?: number }> = ({ cx, cy, r, progress, spin, dots = 1 }) => {
  const angles = [-90, 150, 30].map(a => ((a + spin) * Math.PI) / 180);
  const pts = angles.map(a => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }));
  return (
    <g>
      <Ring cx={cx} cy={cy} r={r} progress={progress} width={Math.max(6, r / 26)} />
      {pts.map((p, i) => (
        <g key={i} opacity={clamp01(dots)}>
          <circle cx={p.x} cy={p.y} r={r / 7.5} fill={C.bg} stroke={C.gold} strokeWidth={Math.max(3, r / 60)} />
          <circle cx={p.x} cy={p.y} r={r / 16} fill="#fff" />
        </g>
      ))}
    </g>
  );
};

export const Title: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.title;
  if (t < start || t > end + 0.4) return null;
  const o = Math.min(ramp(t, start + 0.15, start + 0.45), 1 - ramp(t, end - 0.3, end + 0.2));
  const burst = Array.from({ length: 46 }, (_, i) => {
    const a = random(`b${i}`) * Math.PI * 2;
    const d = easeOut(ramp(t, DROP, DROP + 1.4)) * (260 + random(`d${i}`) * 520);
    return <circle key={i} cx={960 + Math.cos(a) * d} cy={400 + Math.sin(a) * d} r={2 + random(`r${i}`) * 4} fill={C.gold} opacity={0.8 * (1 - ramp(t, DROP + 0.4, DROP + 1.5))} />;
  });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <GlowDefs />
        {burst}
        <Logo cx={960} cy={400} r={230} progress={1} spin={(t - DROP) * 14} />
      </svg>
      <div style={{ position: "absolute", top: 680, width: 1920, textAlign: "center", fontFamily: FONT }}>
        <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: 18, color: C.ink, transform: `scale(${pop(t, DROP + 0.2, 0.6)})` }}>
          FAVOR <span style={{ color: C.gold }}>LOOP</span>
        </div>
        <div style={{ marginTop: 18, fontSize: 42, fontWeight: 500, color: C.muted, opacity: ramp(t, 18.4, 18.9) }}>
          No two of us could trade. The three of us could.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------------------------------- kidney exchange
type Badge = { x: number; y: number; at: number; favor: string };
const LOOP_BADGES: Badge[] = [
  { x: 560, y: 380, at: 21.3, favor: "💻" },
  { x: 780, y: 660, at: 21.6, favor: "🧘" },
  { x: 340, y: 660, at: 21.9, favor: "📸" },
];
const CHAIN: Badge[] = [
  { x: 1180, y: 380, at: 25.95, favor: "🎵" },
  { x: 1440, y: 540, at: 26.25, favor: "🌴" },
  { x: 1700, y: 700, at: 26.85, favor: "🎨" },
];
const donor = (b: Badge, single = false) => ({ x: single ? b.x : b.x - 50, y: b.y });
const patient = (b: Badge) => ({ x: b.x + 50, y: b.y });

const PairBadge: React.FC<{ b: Badge; t: number; single?: boolean; crossAt?: number; morph: number }> = ({ b, t, single, crossAt, morph }) => {
  const s = pop(t, b.at, 0.45);
  if (s <= 0) return null;
  const cross = crossAt !== undefined && t > crossAt ? pop(t, crossAt, 0.35) : 0;
  return (
    <g transform={`translate(${b.x},${b.y}) scale(${s})`}>
      <g opacity={1 - morph}>
        <rect x={single ? -48 : -100} y={-44} width={single ? 96 : 200} height={88} rx={44} fill={C.panel} stroke={C.line} strokeWidth={2} />
        <circle cx={single ? 0 : -50} cy={0} r={28} fill="none" stroke={C.gold} strokeWidth={4} />
        <text x={single ? 0 : -50} y={2} fontSize={28} textAnchor="middle" dominantBaseline="central" fill={C.gold}>♥</text>
        {!single && <circle cx={50} cy={0} r={28} fill={C.dot} />}
        {!single && cross > 0 && (
          <g transform={`scale(${cross})`}>
            <circle r={17} fill={C.red} />
            <path d="M-7,-7 L7,7 M7,-7 L-7,7" stroke="#fff" strokeWidth={4.5} strokeLinecap="round" />
          </g>
        )}
        <text x={single ? 0 : -50} y={64} fontSize={20} textAnchor="middle" fill={C.muted} fontFamily={FONT}>{single ? "gives" : "donor"}</text>
        {!single && <text x={50} y={64} fontSize={20} textAnchor="middle" fill={C.muted} fontFamily={FONT}>patient</text>}
      </g>
      <g opacity={morph} transform={`scale(${0.6 + 0.4 * morph})`}>
        <circle r={62} fill={C.panel} stroke={C.gold} strokeWidth={4} filter="url(#glow)" />
        <text y={4} fontSize={64} textAnchor="middle" dominantBaseline="central">{b.favor}</text>
      </g>
    </g>
  );
};

export const Kidney: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.kidney;
  if (t < start || t > end) return null;
  const o = windowed(t, start, end, 0.3);
  const morph = easeInOut(ramp(t, 28.9, 29.4));
  const head = phrase("vo05", 0).start;
  const loopAt = phrase("vo05", 1).start; // "loops,"
  const arrowsLoop = [0, 1, 2].map(i => easeOut(ramp(t, loopAt + 0.05 + i * 0.3, loopAt + 0.45 + i * 0.3)));
  const chainArrows = [easeOut(ramp(t, 26.4, 26.8)), easeOut(ramp(t, 27.0, 27.4)), easeOut(ramp(t, 27.6, 28.0))];
  // after the morph the arrows join favour circles instead of badge halves
  const ends = (from: Badge, to: Badge, single = false) =>
    morph < 0.5 ? { a: donor(from, single), b: patient(to) } : { a: { x: from.x, y: from.y }, b: { x: to.x, y: to.y } };
  const inset = morph < 0.5 ? 34 : 72;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{ position: "absolute", top: 90, width: 1920, display: "flex", justifyContent: "center", transform: `scale(${pop(t, head, 0.45)})` }}>
        <Chip size={40} color={C.gold} bg="rgba(255,200,87,0.10)">{morph < 0.5 ? "Borrowed from kidney exchange" : "…rebuilt for 15-minute favors"}</Chip>
      </div>
      <div style={{ position: "absolute", top: 46, right: 60, fontFamily: FONT, fontSize: 22, color: C.muted, opacity: ramp(t, 21.5, 22.2) * (1 - morph) }}>
        Kidney paired exchange · market design, Nobel 2012
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <GlowDefs />
        {LOOP_BADGES.map((b, i) => {
          const next = LOOP_BADGES[(i + 1) % 3];
          const e = ends(b, next);
          return <Arrow key={`l${i}`} a={e.a} b={e.b} progress={arrowsLoop[i]} color={C.gold} glow width={6} bend={0.22} inset={inset} />;
        })}
        <Arrow a={ends(CHAIN[0], CHAIN[1], true).a} b={ends(CHAIN[0], CHAIN[1], true).b} progress={chainArrows[0]} color={C.ink} width={6} bend={0.12} inset={inset} />
        <Arrow a={ends(CHAIN[1], CHAIN[2]).a} b={ends(CHAIN[1], CHAIN[2]).b} progress={chainArrows[1]} color={C.ink} width={6} bend={0.12} inset={inset} />
        <Arrow a={morph < 0.5 ? donor(CHAIN[2]) : CHAIN[2]} b={{ x: 1900, y: 860 }} progress={chainArrows[2]} color={C.ink} width={5} dashed bend={0.1} inset={inset} />
        {LOOP_BADGES.map((b, i) => <PairBadge key={`b${i}`} b={b} t={t} crossAt={22.6 + i * 0.15} morph={morph} />)}
        {CHAIN.map((b, i) => <PairBadge key={`c${i}`} b={b} t={t} single={i === 0} morph={morph} />)}
        <text x={560} y={860} fontSize={30} fontWeight={800} letterSpacing={6} textAnchor="middle" fill={C.gold} fontFamily={FONT} opacity={ramp(t, loopAt, loopAt + 0.4)}>LOOP</text>
        <text x={1440} y={860} fontSize={30} fontWeight={800} letterSpacing={6} textAnchor="middle" fill={C.ink} fontFamily={FONT} opacity={ramp(t, 25.95, 26.35)}>CHAIN</text>
      </svg>
    </AbsoluteFill>
  );
};

export { B };
