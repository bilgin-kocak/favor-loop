// Shared visual pieces: background, glow, rings, arrows, people, chips, phones, captions.
import React from "react";
import { AbsoluteFill, random } from "remotion";
import { clamp01, easeOut, pop, T } from "./time";

export const C = {
  bg: "#0b1020",
  panel: "#121a30",
  line: "#2a3557",
  ink: "#e8eefc",
  muted: "#8a97b8",
  gold: "#ffc857",
  goldDeep: "#f2a93b",
  dot: "#a9b7d9",
  red: "#ff5c6c",
  sim: "#ff6b9a",
  green: "#5ee0a0",
};
export const FONT = "Inter, 'Inter Display', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";

export const Background: React.FC<{ t: number }> = ({ t }) => {
  const dots = Array.from({ length: 70 }, (_, i) => {
    const x = random(`x${i}`) * 1920;
    const speed = 6 + random(`s${i}`) * 14;
    const y = (((random(`y${i}`) * 1180 - t * speed) % 1180) + 1180) % 1180 - 50;
    const r = 1 + random(`r${i}`) * 2.2;
    const o = 0.08 + random(`o${i}`) * 0.22;
    return <circle key={i} cx={x + Math.sin(t * 0.4 + i) * 12} cy={y} r={r} fill={C.dot} opacity={o} />;
  });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(1300px 820px at 50% 46%, #16203f 0%, #0b1020 62%, #060914 100%)" }}>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>{dots}</svg>
    </AbsoluteFill>
  );
};

/** Each SVG needs its own glow definition. userSpaceOnUse so a straight line still glows; the region reaches into negative
 *  coordinates because it is read in the coordinates of the glowing element, which may sit in a translated group. */
export const GlowDefs: React.FC<{ id?: string; blur?: number }> = ({ id = "glow", blur = 6 }) => (
  <defs>
    <filter id={id} filterUnits="userSpaceOnUse" x="-1920" y="-1080" width="3840" height="2160">
      <feGaussianBlur stdDeviation={blur} result="b" />
      <feMerge>
        <feMergeNode in="b" />
        <feMergeNode in="b" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
);

/** A ring drawn clockwise from the top as `progress` goes 0 -> 1. */
export const Ring: React.FC<{ cx: number; cy: number; r: number; progress: number; width?: number; color?: string; glow?: boolean; opacity?: number }> = ({
  cx, cy, r, progress, width = 8, color = C.gold, glow = true, opacity = 1,
}) => {
  const circumference = 2 * Math.PI * r;
  return (
    <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" opacity={opacity}
      strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamp01(progress))}
      transform={`rotate(-90 ${cx} ${cy})`} filter={glow ? "url(#glow)" : undefined} />
  );
};

type Pt = { x: number; y: number };
const bez = (a: Pt, c: Pt, b: Pt, u: number): Pt => ({
  x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x,
  y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y,
});

/** A curved arrow from a to b, drawn as `progress` goes 0 -> 1, with an optional label at its middle. */
export const Arrow: React.FC<{
  a: Pt; b: Pt; progress: number; bend?: number; color?: string; width?: number; dashed?: boolean; label?: string;
  labelOpacity?: number; glow?: boolean; inset?: number; opacity?: number; cross?: number;
}> = ({ a, b, progress, bend = 0.18, color = C.ink, width = 6, dashed, label, labelOpacity = 1, glow, inset = 78, opacity = 1, cross = 0 }) => {
  if (progress <= 0 && cross <= 0) return null;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const A = { x: a.x + ux * inset, y: a.y + uy * inset };
  const Bp = { x: b.x - ux * inset, y: b.y - uy * inset };
  const mid = { x: (A.x + Bp.x) / 2 - uy * len * bend, y: (A.y + Bp.y) / 2 + ux * len * bend };
  const p = clamp01(progress);
  const head = bez(A, mid, Bp, Math.max(0.001, p));
  const before = bez(A, mid, Bp, Math.max(0, p - 0.02));
  const angle = (Math.atan2(head.y - before.y, head.x - before.x) * 180) / Math.PI;
  const labelPt = bez(A, mid, Bp, 0.5);
  const lift = { x: -uy * 38, y: ux * 38 };
  return (
    <g opacity={opacity}>
      <path d={`M${A.x},${A.y} Q${mid.x},${mid.y} ${Bp.x},${Bp.y}`} pathLength={1} fill="none" stroke={color} strokeWidth={width}
        strokeLinecap="round" strokeDasharray={dashed ? "0.02 0.025" : `${p} 1`} strokeDashoffset={0}
        opacity={dashed ? Math.min(1, p * 3) : 1} filter={glow ? "url(#glow)" : undefined} />
      {p > 0.04 && !dashed && (
        <polygon points="0,-13 26,0 0,13" fill={color} transform={`translate(${head.x},${head.y}) rotate(${angle})`} filter={glow ? "url(#glow)" : undefined} />
      )}
      {label && p > 0.35 && (
        <text x={labelPt.x + lift.x} y={labelPt.y + lift.y} fontSize={46} textAnchor="middle" dominantBaseline="central" opacity={labelOpacity * clamp01((p - 0.35) * 3)}>
          {label}
        </text>
      )}
      {cross > 0 && (
        <g transform={`translate(${labelPt.x},${labelPt.y}) scale(${pop(cross, 0)})`}>
          <circle r={30} fill={C.red} />
          <path d="M-12,-12 L12,12 M12,-12 L-12,12" stroke="#fff" strokeWidth={7} strokeLinecap="round" />
        </g>
      )}
    </g>
  );
};

export const Chip: React.FC<{ children: React.ReactNode; color?: string; bg?: string; size?: number; style?: React.CSSProperties }> = ({
  children, color = C.ink, bg = "rgba(255,255,255,0.08)", size = 30, style,
}) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: 12, padding: `${size * 0.32}px ${size * 0.7}px`, borderRadius: 999, background: bg,
    border: "1px solid rgba(255,255,255,0.12)", color, fontFamily: FONT, fontSize: size, fontWeight: 600, whiteSpace: "nowrap", ...style }}>
    {children}
  </div>
);

export type Person = { name: string; initial: string; gives: [string, string]; wants: [string, string]; hue: string };
export const PEOPLE: Record<"priya" | "arjun" | "maya", Person> = {
  priya: { name: "Priya", initial: "P", gives: ["💻", "Code review"], wants: ["📸", "A portrait"], hue: "#6c8cff" },
  arjun: { name: "Arjun", initial: "A", gives: ["📸", "Portraits"], wants: ["🧘", "Yoga"], hue: "#ff8a5b" },
  maya: { name: "Maya", initial: "M", gives: ["🧘", "Yoga"], wants: ["💻", "A code review"], hue: "#3fd0a8" },
};

/** A person: avatar, name, what they give and want. `appear` and `wantsAppear` are 0..1 springs. */
export const PersonCard: React.FC<{ p: Person; x: number; y: number; appear: number; wantsAppear: number; scale?: number; dim?: number; compact?: boolean }> = ({
  p, x, y, appear, wantsAppear, scale = 1, dim = 0, compact,
}) => {
  if (appear <= 0) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${scale * appear})`, opacity: clamp01(appear * 1.5) * (1 - dim * 0.55),
      display: "flex", flexDirection: "column", alignItems: "center", gap: 14, fontFamily: FONT }}>
      <div style={{ width: 132, height: 132, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, ${p.hue}, ${p.hue}55 70%)`,
        boxShadow: `0 0 40px ${p.hue}66`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 60, fontWeight: 800 }}>
        {p.initial}
      </div>
      <div style={{ color: C.ink, fontSize: 40, fontWeight: 800, letterSpacing: 0.5, padding: "0 14px", borderRadius: 999, background: compact ? "rgba(11,16,32,0.82)" : undefined }}>
        {p.name}
      </div>
      {!compact && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          <Chip size={27}><span style={{ color: C.muted, fontWeight: 500 }}>gives</span> {p.gives[0]} {p.gives[1]}</Chip>
          <div style={{ opacity: clamp01(wantsAppear * 1.4), transform: `translateY(${(1 - easeOut(wantsAppear)) * 16}px)` }}>
            <Chip size={27} bg="rgba(255,200,87,0.12)"><span style={{ color: C.muted, fontWeight: 500 }}>wants</span> {p.wants[0]} {p.wants[1]}</Chip>
          </div>
        </div>
      )}
    </div>
  );
};

/** A person with the name and favors beside the avatar (centred on x, y), so arrows between avatars never cross them. */
export const SideCard: React.FC<{ p: Person; x: number; y: number; side: "left" | "right"; appear: number; wantsAppear: number; lift?: number }> = ({
  p, x, y, side, appear, wantsAppear, lift = 0,
}) => {
  if (appear <= 0) return null;
  const right = side === "right";
  return (
    <>
      <div style={{ position: "absolute", left: x, top: y, width: 132, height: 132, transform: `translate(-50%, -50%) scale(${appear})`, borderRadius: 999,
        background: `radial-gradient(circle at 35% 30%, ${p.hue}, ${p.hue}55 70%)`, boxShadow: `0 0 40px ${p.hue}66`, display: "flex", alignItems: "center",
        justifyContent: "center", color: "#fff", fontSize: 60, fontWeight: 800, fontFamily: FONT, opacity: clamp01(appear * 1.5) }}>
        {p.initial}
      </div>
      <div style={{ position: "absolute", top: y + lift, left: right ? x + 90 : undefined, right: right ? undefined : 1920 - x + 90, fontFamily: FONT,
        transform: `translateY(-50%) translateX(${(1 - easeOut(appear)) * (right ? -24 : 24)}px)`, opacity: clamp01(appear * 1.5),
        display: "flex", flexDirection: "column", gap: 10, alignItems: right ? "flex-start" : "flex-end" }}>
        <div style={{ color: C.ink, fontSize: 40, fontWeight: 800, letterSpacing: 0.5 }}>{p.name}</div>
        <Chip size={27}><span style={{ color: C.muted, fontWeight: 500 }}>gives</span> {p.gives[0]} {p.gives[1]}</Chip>
        <div style={{ opacity: clamp01(wantsAppear * 1.4), transform: `translateY(${(1 - easeOut(wantsAppear)) * 16}px)` }}>
          <Chip size={27} bg="rgba(255,200,87,0.12)"><span style={{ color: C.muted, fontWeight: 500 }}>wants</span> {p.wants[0]} {p.wants[1]}</Chip>
        </div>
      </div>
    </>
  );
};

/** The current voiceover phrase, bottom centre. Hidden ("vo01", or one phrase: "vo10.0") where the same words are already on screen. */
export const Caption: React.FC<{ t: number; hidden: string[] }> = ({ t, hidden }) => {
  for (const [name, vo] of Object.entries(T.vo)) {
    if (hidden.includes(name)) continue;
    for (const [i, ph] of vo.phrases.entries()) {
      if (hidden.includes(`${name}.${i}`)) continue;
      if (t >= ph.start - 0.08 && t <= ph.end + 0.25) {
        const o = Math.min(clamp01((t - ph.start + 0.08) / 0.12), clamp01((ph.end + 0.25 - t) / 0.15));
        return (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 58, display: "flex", justifyContent: "center", opacity: o }}>
            <div style={{ maxWidth: 1500, padding: "14px 30px", borderRadius: 18, background: "rgba(6,9,20,0.72)", color: "#fff", fontFamily: FONT,
              fontSize: 44, fontWeight: 600, textAlign: "center", lineHeight: 1.25, boxShadow: "0 10px 40px rgba(0,0,0,0.35)" }}>
              {ph.text}
            </div>
          </div>
        );
      }
    }
  }
  return null;
};

/** A phone frame; children render inside the screen. */
export const Phone: React.FC<{ x: number; y: number; scale?: number; w?: number; h?: number; children: React.ReactNode; title?: string; subtitle?: string; glow?: number }> = ({
  x, y, scale = 1, w = 460, h = 900, children, title = "Favor Loop", subtitle = "bot", glow = 0,
}) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, transform: `translate(-50%, -50%) scale(${scale})`, borderRadius: 62,
    background: "#05070f", border: "12px solid #1c2440", boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 ${60 * glow}px ${C.gold}`, overflow: "hidden", fontFamily: FONT }}>
    <div style={{ height: 96, background: "#111934", display: "flex", alignItems: "center", gap: 16, padding: "18px 26px 0" }}>
      <div style={{ width: 52, height: 52, borderRadius: 999, background: `radial-gradient(circle at 35% 30%, ${C.gold}, ${C.goldDeep})`, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 28 }}>🔁</div>
      <div>
        <div style={{ color: C.ink, fontWeight: 700, fontSize: 26 }}>{title}</div>
        <div style={{ color: C.muted, fontSize: 20 }}>{subtitle}</div>
      </div>
    </div>
    <div style={{ position: "absolute", top: 96, left: 0, right: 0, bottom: 0, padding: 20, display: "flex", flexDirection: "column", gap: 16,
      background: "linear-gradient(#0c1226, #0a0f1f)" }}>
      {children}
    </div>
  </div>
);

export const Bubble: React.FC<{ from: "me" | "them"; appear: number; children: React.ReactNode; width?: number }> = ({ from, appear, children, width }) => {
  if (appear <= 0) return null;
  const me = from === "me";
  return (
    <div style={{ alignSelf: me ? "flex-end" : "flex-start", maxWidth: width ?? 360, padding: "14px 18px", borderRadius: 22,
      borderBottomRightRadius: me ? 6 : 22, borderBottomLeftRadius: me ? 22 : 6, background: me ? "#2b4fd6" : "#1a2340", color: "#f3f6ff",
      fontSize: 22, lineHeight: 1.35, transform: `scale(${appear}) translateY(${(1 - clamp01(appear)) * 20}px)`, transformOrigin: me ? "right bottom" : "left bottom",
      opacity: clamp01(appear * 2), boxShadow: "0 6px 20px rgba(0,0,0,0.3)" }}>
      {children}
    </div>
  );
};

/** A small label in a corner that says what kind of footage this is. */
export const Badge: React.FC<{ children: React.ReactNode; color?: string; opacity?: number; style?: React.CSSProperties }> = ({ children, color = C.gold, opacity = 1, style }) => (
  <div style={{ position: "absolute", left: 60, top: 50, opacity, display: "flex", alignItems: "center", gap: 14, padding: "12px 22px", borderRadius: 14,
    background: "rgba(6,9,20,0.75)", border: `2px solid ${color}`, color, fontFamily: FONT, fontSize: 26, fontWeight: 800, letterSpacing: 2, ...style }}>
    <span style={{ width: 14, height: 14, borderRadius: 99, background: color }} />
    {children}
  </div>
);
