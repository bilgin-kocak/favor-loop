// Scenes 6-11: the agent session, everyone's yes, the proof, the simulated village, Kismet, and the close.
import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, random, staticFile } from "remotion";
import { Arrow, Badge, C, Chip, FONT, GlowDefs, MONO, PEOPLE, PersonCard, Phone, Ring } from "./components";
import { Logo } from "./scenes1";
import { B, FPS, S, clamp01, easeInOut, easeOut, phrase, pop, ramp, windowed } from "./time";

type Pt = { x: number; y: number };
type Who = "priya" | "arjun" | "maya";

/** A highlighter stroke that sweeps across its words from `at`. */
const Mark: React.FC<{ t: number; at: number; children: React.ReactNode; color?: string }> = ({ t, at, children, color = "rgba(255,200,87,0.4)" }) => {
  const p = easeOut(ramp(t, at, at + 0.45)) * 100;
  return (
    <span style={{ background: `linear-gradient(90deg, ${color} ${p}%, transparent ${p}%)`, borderRadius: 6, padding: "0 4px", margin: "0 -4px",
      boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
      {children}
    </span>
  );
};

const Cursor: React.FC<{ t: number }> = ({ t }) => (
  <span style={{ display: "inline-block", width: "0.6em", height: "1.05em", marginLeft: 4, verticalAlign: "text-bottom", background: C.muted,
    opacity: Math.floor(t * 2.4) % 2 === 0 ? 0.9 : 0 }} />
);

/** A desktop window with a title bar. */
const Window: React.FC<{ x: number; y: number; w: number; h: number; title: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }> = ({
  x, y, w, h, title, children, style,
}) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 22, background: "#0d1428", border: `2px solid ${C.line}`,
    boxShadow: "0 30px 80px rgba(0,0,0,0.5)", overflow: "hidden", fontFamily: FONT, ...style }}>
    <div style={{ height: 50, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: "#121a33", borderBottom: `1px solid ${C.line}` }}>
      {["#ff5f57", "#febc2e", "#28c840"].map(c => <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c, opacity: 0.85 }} />)}
      <div style={{ marginLeft: 14, color: C.muted, fontSize: 22, fontWeight: 600 }}>{title}</div>
    </div>
    <div style={{ position: "absolute", top: 50, left: 0, right: 0, bottom: 0 }}>{children}</div>
  </div>
);

// --------------------------------------------------------------------------------------------- the agent session
// Re-typeset from a real headless Claude Code session (the Favor Loop skill, test accounts); "…" marks the cuts.
const AG = {
  ask: 31.0,
  plan: phrase("vo07", 0).start + 0.05, // "It shows you exactly what it will send"
  yes: phrase("vo07", 1).start + 0.05, // "waits for your yes"
  call: 37.4,
  saved: phrase("vo07", 2).start + 0.1, // "and the moment a loop exists"
  myLoops: 38.95,
  loopsResult: 39.4,
  loop: phrase("vo07", 3).start - 0.05, // "it finds it."
};

/** A chat message that scrolls the conversation up as it arrives; the agent's shows a typing indicator first. */
const Msg: React.FC<{ t: number; at: number; from: "me" | "agent"; h: number; typingFrom?: number; children: React.ReactNode }> = ({
  t, at, from, h, typingFrom, children,
}) => {
  const start = typingFrom ?? at;
  if (t < start) return null;
  const me = from === "me";
  const typing = t < at;
  const base = typingFrom !== undefined ? 76 : 0;
  const height = typing ? 76 * easeOut(ramp(t, start, start + 0.2)) : base + (h - base) * easeOut(ramp(t, at, at + 0.4));
  return (
    <div style={{ maxHeight: height, overflow: "hidden", flexShrink: 0, boxSizing: "border-box", paddingTop: 18, display: "flex",
      justifyContent: me ? "flex-end" : "flex-start" }}>
      {typing ? (
        <div style={{ display: "inline-flex", gap: 8, padding: "20px 22px", borderRadius: 22, background: "#1a2340" }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ width: 12, height: 12, borderRadius: 99, background: C.muted, opacity: 0.35 + 0.65 * Math.max(0, Math.sin((t - start) * 9 - i * 0.9)) }} />
          ))}
        </div>
      ) : (
        <div style={{ maxWidth: 660, padding: "14px 22px", borderRadius: 22, borderBottomRightRadius: me ? 6 : 22, borderBottomLeftRadius: me ? 22 : 6,
          background: me ? "#2b4fd6" : "#1a2340", color: "#f3f6ff", fontSize: 25, lineHeight: 1.42, opacity: clamp01((t - at) / 0.15) }}>
          {children}
        </div>
      )}
    </div>
  );
};

const Id: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontFamily: MONO, fontSize: 20, color: C.muted }}>({children})</span>
);

export const Agent: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.agent;
  if (t < start || t > end) return null;
  const o = windowed(t, start, end, 0.3);
  const enter = easeOut(ramp(t, start, start + 0.6));
  const typed = (text: string, at: number, cps: number) => text.slice(0, Math.max(0, Math.floor((t - at) * cps)));
  const args = '{ "offers": ["code_review"], "wants": ["portrait_photo"] }';
  const line = (at: number) => ({ opacity: ramp(t, at, at + 0.12), marginTop: 10 });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Badge color={C.green}>REAL AGENT SESSION · TEST ACCOUNTS</Badge>
      <div style={{ position: "absolute", left: 62, top: 116, fontFamily: FONT, fontSize: 22, color: C.muted }}>
        Claude Code + the Favor Loop skill, through a local stand-in for the village tool · transcript re-typeset
      </div>
      <Window x={80} y={168 + (1 - enter) * 40} w={860} h={762} title="Claude Code · test account">
        <div style={{ position: "absolute", inset: 0, padding: "0 26px 26px", display: "flex", flexDirection: "column", justifyContent: "flex-end", overflow: "hidden" }}>
          <Msg t={t} at={AG.ask} from="me" h={120}>Join Favor Loop: I can review code, I'd like a portrait.</Msg>
          <Msg t={t} at={AG.plan} typingFrom={32.9} from="agent" h={360}>
            Both of your choices are on the Favor Loop menu, so this is what I'd send to join:
            <div style={{ margin: "8px 0 8px 6px" }}>
              <div>• <b>You offer:</b> Code review <Id>code_review</Id></div>
              <div>• <b>You want:</b> Portrait photo <Id>portrait_photo</Id></div>
              <div>• <b>Gift-only:</b> No. You're trading, not only giving.</div>
            </div>
            <Mark t={t} at={AG.plan + 0.9}>Nothing has been sent yet.</Mark> … Once you confirm, I'll join you.
          </Msg>
          <Msg t={t} at={AG.yes} from="me" h={86}>Yes, send it.</Msg>
          <Msg t={t} at={AG.loop} typingFrom={AG.yes + 0.45} from="agent" h={520}>
            You've joined Favor Loop. …
            <div style={{ marginTop: 8 }}>
              Favor Loop has already proposed a <Mark t={t} at={AG.loop + 0.35}>three-way loop</Mark> for you:
            </div>
            <div style={{ margin: "8px 0 8px 6px" }}>
              <div>• Another resident takes your portrait photo.</div>
              <div>• You do a code review for a second resident.</div>
              <div>• That second resident gives the first one a yoga or stretching session.</div>
            </div>
            <div><b>When:</b> Friday morning · <b>Where:</b> The Circle, or online</div>
            <div style={{ marginTop: 8 }}>Do you want to say <b>yes</b> or <b>no</b> to this loop?</div>
          </Msg>
        </div>
      </Window>
      <Window x={1000} y={320 + (1 - enter) * 60} w={840} h={450} title="village tool calls">
        <div style={{ padding: "18px 26px", fontFamily: MONO, fontSize: 21, lineHeight: 1.5, color: C.ink }}>
          {t < AG.call && (
            <div style={{ color: C.muted, fontStyle: "italic" }}>
              {t < AG.plan ? "" : "0 calls sent · waiting for your yes"}
              <Cursor t={t} />
            </div>
          )}
          {t >= AG.call && (
            <div style={{ color: C.gold }}>
              {typed("→ village  favorloop.join", AG.call, 80)}
              <div style={{ color: "#9fb3ff", paddingLeft: 28 }}>{typed(args, AG.call + 0.35, 120)}</div>
            </div>
          )}
          {t >= AG.saved && (
            <div style={{ ...line(AG.saved), paddingLeft: 28, textIndent: -28 }}>
              ← Saved: you offer Code review and would like Portrait photo, and <Mark t={t} at={AG.saved + 0.3}>a loop was just proposed to you</Mark>, so
              check your loops to say yes or no.
            </div>
          )}
          {t >= AG.myLoops && <div style={{ ...line(AG.myLoops), color: C.gold }}>{typed("→ village  favorloop.my_loops", AG.myLoops, 80)}</div>}
          {t >= AG.loopsResult && (
            <div style={{ ...line(AG.loopsResult), paddingLeft: 28, textIndent: -28 }}>
              {'← { "loops": [{ "shape": "loop3", "status": "proposed", "window": "Friday morning", … }] }'}
            </div>
          )}
          {t >= AG.call && <Cursor t={t} />}
        </div>
      </Window>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------------------------------------ everyone says yes
// The Telegram bot's own wording (src/bot.ts): the proposal, "You said yes", then "Everyone said yes!".
const STEPS: Record<Who, [string, React.ReactNode][]> = {
  priya: [
    ["💻", <>You give <b>Code review</b> → a resident</>],
    ["🧘", <>A resident gives <b>Yoga or stretching session</b> → another resident</>],
    ["📸", <>Another resident gives <b>Portrait photo</b> → you</>],
  ],
  arjun: [
    ["📸", <>You give <b>Portrait photo</b> → a resident</>],
    ["💻", <>A resident gives <b>Code review</b> → another resident</>],
    ["🧘", <>Another resident gives <b>Yoga or stretching session</b> → you</>],
  ],
  maya: [
    ["🧘", <>You give <b>Yoga or stretching session</b> → a resident</>],
    ["📸", <>A resident gives <b>Portrait photo</b> → another resident</>],
    ["💻", <>Another resident gives <b>Code review</b> → you</>],
  ],
};
const H = (s: string) => <span style={{ color: "#8fb0ff", fontWeight: 700 }}>{s}</span>;
const DEAL: Record<Who, [string, React.ReactNode][]> = {
  priya: [["💻", <>You give <b>Code review</b> to {H("@maya_yoga")}.</>], ["📸", <>You receive <b>Portrait photo</b> from {H("@arjun_photo")}.</>]],
  arjun: [["📸", <>You give <b>Portrait photo</b> to {H("@priya_dev")}.</>], ["🧘", <>You receive <b>Yoga or stretching session</b> from {H("@maya_yoga")}.</>]],
  maya: [["🧘", <>You give <b>Yoga or stretching session</b> to {H("@arjun_photo")}.</>], ["💻", <>You receive <b>Code review</b> from {H("@priya_dev")}.</>]],
};
const YES: { k: Who; x: number; at: number; waiting: number }[] = [
  { k: "maya", x: 480, at: B.yes1, waiting: 2 },
  { k: "priya", x: 960, at: B.yes2, waiting: 1 },
  { k: "arjun", x: 1440, at: B.yes3, waiting: 0 },
];
const NO_LINE_AT = phrase("vo08", 2).start + 0.05; // "And nobody ever learns who said no."

const BotMsg: React.FC<{ t: number; at: number; h: number; children: React.ReactNode }> = ({ t, at, h, children }) => {
  if (t < at) return null;
  const s = pop(t, at, 0.45);
  return (
    <div style={{ maxHeight: h * easeOut(ramp(t, at, at + 0.35)), flexShrink: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderRadius: 22, borderBottomLeftRadius: 6, background: "#1a2340", color: "#f3f6ff", fontSize: 23, lineHeight: 1.36,
        transform: `scale(${0.85 + 0.15 * s})`, transformOrigin: "left bottom", opacity: clamp01((t - at) / 0.15) }}>
        {children}
      </div>
    </div>
  );
};

const KeyButton: React.FC<{ children: React.ReactNode; pressed?: number; tap?: number }> = ({ children, pressed = 0, tap = 0 }) => (
  <div style={{ position: "relative", flex: 1, height: 56, borderRadius: 14, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
    background: pressed > 0 ? `rgba(94,224,160,${0.18 + 0.5 * pressed})` : "rgba(255,255,255,0.10)", color: "#fff", fontSize: 26, fontWeight: 700,
    transform: `scale(${1 - 0.06 * Math.sin(Math.PI * clamp01(tap * 3))})` }}>
    {tap > 0 && tap < 0.4 && (
      <span style={{ position: "absolute", width: 160 * easeOut(tap / 0.4), height: 160 * easeOut(tap / 0.4), borderRadius: 999, background: "#fff",
        opacity: 0.45 * (1 - tap / 0.4) }} />
    )}
    <span style={{ position: "relative" }}>{children}</span>
  </div>
);

const NameTag: React.FC<{ k: Who; x: number; y: number; opacity: number }> = ({ k, x, y, opacity }) => {
  const p = PEOPLE[k];
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 14, opacity, fontFamily: FONT }}>
      <div style={{ width: 54, height: 54, borderRadius: 99, background: `radial-gradient(circle at 35% 30%, ${p.hue}, ${p.hue}55 70%)`, boxShadow: `0 0 24px ${p.hue}66`,
        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 26, fontWeight: 800 }}>{p.initial}</div>
      <div style={{ color: C.ink, fontSize: 32, fontWeight: 800 }}>{p.name}</div>
    </div>
  );
};

export const Yeses: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.yeses;
  if (t < start || t > end) return null;
  const o = windowed(t, start, end, 0.3);
  const accepted = B.accepted;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      {YES.map(({ k, x, at, waiting }, i) => {
        const inAt = start + 0.1 + i * 0.12;
        const enter = easeOut(ramp(t, inAt, inAt + 0.5));
        const tap = t >= at ? t - at : 0;
        const saidYes = ramp(t, at + 0.3, at + 0.5);
        const keyboard = 1 - ramp(t, at + 0.3, at + 0.5);
        const glow = t >= accepted ? 0.25 + 0.75 * Math.exp(-(t - accepted) * 2.5) : 0;
        return (
          <React.Fragment key={k}>
            <NameTag k={k} x={x} y={172} opacity={enter} />
            <Phone x={x} y={575 + (1 - enter) * 80} scale={0.86} w={480} h={840} glow={glow}>
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, overflow: "hidden", opacity: enter,
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0px, #000 40px)" }}>
                <div style={{ opacity: 0.6, flexShrink: 0 }}>
                  <BotMsg t={t} at={inAt} h={260}>
                    You are in ✅
                    <div>I will message you as soon as I find a loop. Bring a friend: the more people join, the more loops close.</div>
                  </BotMsg>
                </div>
                <BotMsg t={t} at={inAt + 0.25} h={620}>
                  <div style={{ fontWeight: 800, fontSize: 26 }}>🔁 A favor loop for you!</div>
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {STEPS[k].map(([e, s], j) => <div key={j}>{e} {s}</div>)}
                  </div>
                  <div style={{ marginTop: 10 }}>🕐 Friday morning · The Circle, or online</div>
                  <div>It starts only if all 3 say yes. <Mark t={t} at={NO_LINE_AT + i * 0.12}>A no is never shown to the others.</Mark></div>
                  {saidYes > 0 && (
                    <div style={{ maxHeight: 34 * saidYes, overflow: "hidden", marginTop: 6, color: C.green, fontWeight: 700 }}>
                      You said yes.{waiting > 0 ? ` Waiting for ${waiting} more.` : ""}
                    </div>
                  )}
                </BotMsg>
                {keyboard > 0 && (
                  <div style={{ display: "flex", gap: 10, flexShrink: 0, maxHeight: 56 * keyboard, opacity: keyboard * clamp01((t - inAt - 0.4) / 0.2) }}>
                    <KeyButton pressed={tap > 0 ? clamp01(tap / 0.15) : 0} tap={tap}>✅ Yes</KeyButton>
                    <KeyButton>❌ No</KeyButton>
                  </div>
                )}
                <BotMsg t={t} at={accepted + i * 0.06} h={420}>
                  <div style={{ fontWeight: 800, fontSize: 26 }}>🎉 Everyone said yes!</div>
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {DEAL[k].map(([e, s], j) => <div key={j}>{e} {s}</div>)}
                  </div>
                  <div style={{ marginTop: 10 }}>🕐 Friday morning · The Circle, or online. About 15 minutes, free.</div>
                  <div style={{ marginTop: 12, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.10)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontWeight: 700 }}>I received it ✅</div>
                </BotMsg>
              </div>
            </Phone>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------------------------------------------ the proof
const PT: Record<Who, Pt> = { priya: { x: 960, y: 330 }, arjun: { x: 1240, y: 700 }, maya: { x: 680, y: 700 } };
const PROOF_RING = { cx: 960, cy: 621, r: 291 }; // the circle through all three
const EDGES: { from: Who; to: Who; favor: string; at: number; pill: Pt }[] = [
  { from: "priya", to: "maya", favor: "💻", at: 53.3, pill: { x: 470, y: 700 } },
  { from: "maya", to: "arjun", favor: "🧘", at: 54.1, pill: { x: 1450, y: 700 } },
  { from: "arjun", to: "priya", favor: "📸", at: 54.9, pill: { x: 1185, y: 300 } },
];
const FACTS: [string, number][] = [
  ["⏱ 15 minutes", phrase("vo09", 0).start],
  ["🆓 Free", phrase("vo09", 1).start],
  ["📍 Somewhere public", phrase("vo09", 2).start],
];

export const Proof: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.proof;
  if (t < start || t > end) return null;
  const o = windowed(t, start, end, 0.3);
  const ringAt = B.proofRing;
  const lit = t >= ringAt ? 1 : 0;
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{ position: "absolute", top: 118, width: 1920, display: "flex", justifyContent: "center", gap: 26 }}>
        {FACTS.map(([text, at]) => (
          <div key={text} style={{ transform: `scale(${pop(t, at, 0.45)})`, opacity: clamp01((t - at) * 6) }}>
            <Chip size={38}>{text}</Chip>
          </div>
        ))}
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <GlowDefs />
        {EDGES.map((e, i) => {
          const drawn = easeOut(ramp(t, start + 0.15 + i * 0.25, start + 0.65 + i * 0.25));
          const gold = ramp(t, e.at, e.at + 0.3);
          const color = gold > 0 ? C.gold : "rgba(232,238,252,0.55)";
          return <Arrow key={i} a={PT[e.from]} b={PT[e.to]} progress={drawn} color={color} width={6 + 3 * gold} label={e.favor} glow={gold > 0} inset={92} />;
        })}
        {t >= ringAt && <Ring cx={PROOF_RING.cx} cy={PROOF_RING.cy} r={PROOF_RING.r} progress={easeOut(ramp(t, ringAt, ringAt + 0.25))} width={9} />}
      </svg>
      {(Object.keys(PT) as Who[]).map(k => (
        <PersonCard key={k} p={PEOPLE[k]} x={PT[k].x} y={PT[k].y + 31} appear={pop(t, start + 0.05, 0.4)} wantsAppear={0} compact />
      ))}
      {EDGES.map(e => {
        const s = pop(t, e.at, 0.4);
        if (s <= 0) return null;
        return (
          <div key={e.to} style={{ position: "absolute", left: e.pill.x, top: e.pill.y, transform: `translate(-50%, -50%) scale(${s})` }}>
            <Chip size={28} bg="rgba(94,224,160,0.16)" color={C.green}>I received it ✅</Chip>
          </div>
        );
      })}
      {lit > 0 && (
        <>
          <div style={{ position: "absolute", left: 0, width: 1920, top: 478, textAlign: "center", fontFamily: FONT, fontWeight: 800, color: C.gold, lineHeight: 1.15,
            transform: `scale(${pop(t, ringAt + 0.08, 0.5)})`, transformOrigin: "960px 90px", textShadow: `0 0 30px ${C.goldDeep}` }}>
            <div style={{ fontSize: 64 }}>💫</div>
            <div style={{ fontSize: 44 }}>Loop complete!</div>
          </div>
          <AbsoluteFill style={{ background: `radial-gradient(700px 520px at 960px 620px, ${C.gold}, transparent)`, opacity: 0.35 * (1 - ramp(t, ringAt, ringAt + 0.4)) }} />
        </>
      )}
    </AbsoluteFill>
  );
};

// --------------------------------------------------------------------------------------- the simulated village
// A screen capture of /board?view=sim, framed as a browser window; the camera visits a swap, a three-way loop and a
// gift chain (tile centres measured on the capture), then pulls back to the whole simulated village.
const WIN = { x: 240, y: 120, w: 1440, bar: 44 };
const K = WIN.w / 1920;
const WIN_H = 1080 * K;
type Cam = { at: number; dur: number; c: Pt; z: number };
const CAM: Cam[] = [
  { at: 0, dur: 0, c: { x: 960, y: 540 }, z: 1 },
  { at: 57.3, dur: 0.55, c: { x: 796, y: 318 }, z: 2.4 }, // a swap
  { at: 58.45, dur: 0.5, c: { x: 960, y: 483 }, z: 2.4 }, // a three-way loop
  { at: 59.65, dur: 0.5, c: { x: 632, y: 483 }, z: 2.4 }, // a gift chain
  { at: 60.85, dur: 0.8, c: { x: 960, y: 540 }, z: 1 },
];
const camera = (t: number) => {
  let c = CAM[0].c, z = CAM[0].z;
  for (const k of CAM.slice(1)) {
    if (t < k.at) break;
    const u = easeInOut(ramp(t, k.at, k.at + k.dur));
    c = { x: c.x + (k.c.x - c.x) * u, y: c.y + (k.c.y - c.y) * u };
    z = Math.exp(Math.log(z) + (Math.log(k.z) - Math.log(z)) * u);
  }
  return { c, z: z * (1 + 0.03 * ramp(t, 61.7, 65.2)) };
};
const SPOT: [string, number, number][] = [
  ["Swap", 57.6, 58.45],
  ["Three-way loop", 58.7, 59.65],
  ["Gift chain", 59.9, 60.85],
];

export const Scale: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.scale;
  if (t < start - 0.2 || t > end) return null;
  const enter = easeOut(ramp(t, start - 0.15, start + 0.4));
  const o = Math.min(enter, 1 - ramp(t, end - 0.3, end));
  const { c, z } = camera(t);
  const s = K * z;
  const tx = Math.min(0, Math.max(WIN.w - 1920 * s, WIN.w / 2 - c.x * s));
  const ty = Math.min(0, Math.max(WIN_H - 1080 * s, WIN_H / 2 - c.y * s));
  const spot = Math.min(ramp(t, 57.45, 57.75), 1 - ramp(t, 60.8, 61.1));
  const R = 85 * s;
  const stat = { x: 24 * s + tx, y: 126 * s + ty, w: 366 * s, h: 102 * s };
  const statOn = ramp(t, 61.5, 61.8);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Badge color={C.sim} opacity={enter}>SIMULATED · 150 SYNTHETIC MEMBERS</Badge>
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.bar + WIN_H, borderRadius: 18, overflow: "hidden",
        border: `2px solid ${C.line}`, boxShadow: "0 40px 100px rgba(0,0,0,0.6)", background: "#0b1020",
        transform: `perspective(1800px) translateY(${(1 - enter) * 50}px) rotateX(${(1 - enter) * 12}deg) scale(${0.94 + 0.06 * enter})` }}>
        <div style={{ height: WIN.bar, display: "flex", alignItems: "center", gap: 9, padding: "0 18px", background: "#131b33", borderBottom: `1px solid ${C.line}` }}>
          {["#ff5f57", "#febc2e", "#28c840"].map(col => <span key={col} style={{ width: 13, height: 13, borderRadius: 99, background: col, opacity: 0.85 }} />)}
          <div style={{ marginLeft: 18, padding: "5px 18px", borderRadius: 8, background: "#0b1020", color: C.muted, fontFamily: FONT, fontSize: 20 }}>
            favorloop.fly.dev/board?view=sim
          </div>
        </div>
        <div style={{ position: "absolute", top: WIN.bar, left: 0, width: WIN.w, height: WIN_H, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${s})` }}>
            <Sequence from={Math.round((start - 0.2) * FPS)} layout="none">
              <OffthreadVideo src={staticFile("board-sim.mp4")} muted style={{ width: 1920, height: 1080 }} />
            </Sequence>
          </div>
          {spot > 0 && (
            <div style={{ position: "absolute", inset: 0, opacity: spot,
              background: `radial-gradient(circle at ${WIN.w / 2}px ${WIN_H / 2}px, rgba(6,9,20,0) ${R}px, rgba(6,9,20,0.7) ${R + 60}px)` }} />
          )}
          {statOn > 0 && (
            <div style={{ position: "absolute", left: stat.x - 8, top: stat.y - 8, width: stat.w + 16, height: stat.h + 16, borderRadius: 16,
              border: `4px solid ${C.sim}`, boxShadow: `0 0 ${24 + 10 * Math.sin(t * 6)}px ${C.sim}`, opacity: statOn }} />
          )}
        </div>
      </div>
      {SPOT.map(([label, a, b]) => {
        const v = windowed(t, a, b, 0.2);
        if (v <= 0) return null;
        return (
          <div key={label} style={{ position: "absolute", left: WIN.x + WIN.w / 2, top: WIN.y + WIN.bar + WIN_H / 2 - R - 46, opacity: v,
            transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * pop(t, a, 0.4)})` }}>
            <Chip size={34} color={C.gold} bg="rgba(11,16,32,0.85)">{label}</Chip>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------------------------------- Kismet
export const Kismet: React.FC<{ t: number }> = ({ t }) => {
  const [start, end] = S.kismet;
  if (t < start || t > end) return null;
  const o = windowed(t, start, end, 0.35);
  const [l1, l2, whom, l3] = [0, 1, 2, 3].map(i => phrase("vo11", i).start);
  const up = (at: number): React.CSSProperties => ({
    opacity: ramp(t, at - 0.05, at + 0.3),
    transform: `translateY(${(1 - easeOut(ramp(t, at - 0.05, at + 0.5))) * 28}px)`,
  });
  return (
    <AbsoluteFill style={{ opacity: o, fontFamily: FONT, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ ...up(l1), fontSize: 58, fontWeight: 600, color: C.muted }}>Kismet finds who you should meet.</div>
      <div style={{ ...up(l2), marginTop: 80, fontSize: 84, fontWeight: 800, color: C.ink }}>
        <span style={{ color: C.gold }}>Favor Loop</span> finds who can help <span style={{ opacity: ramp(t, whom - 0.05, whom + 0.2) }}>whom,</span>
      </div>
      <div style={{ ...up(l3), marginTop: 14, fontSize: 84, fontWeight: 800, color: C.gold, display: "flex", alignItems: "center", gap: 26 }}>
        <span style={{ position: "relative" }}>
          and proves it happened.
          <span style={{ position: "absolute", left: 0, bottom: -6, height: 8, borderRadius: 4, background: C.gold, boxShadow: `0 0 22px ${C.gold}`,
            width: `${easeOut(ramp(t, l3 + 0.45, l3 + 1.1)) * 100}%` }} />
        </span>
        <span style={{ display: "inline-block", transform: `scale(${pop(t, l3 + 1.0, 0.5)})` }}>✅</span>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------------------------------------------ the close
const LOGO = { cx: 960, cy: 385, r: 190 };
const SEEDS: Pt[] = [{ x: 960, y: 250 }, { x: 1480, y: 700 }, { x: 440, y: 700 }];
const SEED_AT = [75.95, 76.3, 76.65];

export const Close: React.FC<{ t: number }> = ({ t }) => {
  const [start] = S.close;
  if (t < start) return null;
  const hit = B.finalHit;
  const [p1, p2] = [phrase("vo12", 0), phrase("vo12", 1)];
  const reveal = (words: string[], a: number, b: number) =>
    words.map((w, i) => {
      const at = a + (i / words.length) * (b - a);
      return (
        <span key={i} style={{ display: "inline-block", marginRight: "0.28em", opacity: ramp(t, at - 0.05, at + 0.2),
          transform: `translateY(${(1 - easeOut(ramp(t, at - 0.05, at + 0.35))) * 22}px)` }}>{w}</span>
      );
    });
  const textOut = 1 - ramp(t, hit - 0.15, hit + 0.02);
  const spin = Math.max(0, t - hit) * 14;
  // the three dots fly onto the logo's ring at the hit
  const targets = [-90, 150, 30].map(a => ({ x: LOGO.cx + LOGO.r * Math.cos((a * Math.PI) / 180), y: LOGO.cy + LOGO.r * Math.sin((a * Math.PI) / 180) }));
  const fly = easeInOut(ramp(t, hit, hit + 0.28));
  const burst = Array.from({ length: 54 }, (_, i) => {
    const a = random(`cb${i}`) * Math.PI * 2;
    const d = easeOut(ramp(t, hit, hit + 1.5)) * (240 + random(`cd${i}`) * 620);
    return <circle key={i} cx={LOGO.cx + Math.cos(a) * d} cy={LOGO.cy + Math.sin(a) * d} r={2 + random(`cr${i}`) * 4} fill={C.gold}
      opacity={0.8 * (1 - ramp(t, hit + 0.4, hit + 1.6))} />;
  });
  return (
    <AbsoluteFill>
      {t < hit + 0.05 && (
        <div style={{ position: "absolute", top: 380, width: 1920, textAlign: "center", fontFamily: FONT, fontSize: 92, fontWeight: 800, opacity: textOut,
          transform: `scale(${1 - 0.04 * (1 - textOut)})` }}>
          <div style={{ color: C.ink }}>{reveal("No two of us could trade…".split(" "), p1.start, p1.end - 0.3)}</div>
          <div style={{ color: C.gold, marginTop: 16 }}>{reveal("The three of us could.".split(" "), p2.start, p2.end - 0.2)}</div>
        </div>
      )}
      <svg width={1920} height={1080} style={{ position: "absolute" }}>
        <GlowDefs />
        {t >= hit && burst}
        {t < hit + 0.3 && SEEDS.map((p, i) => {
          const s = pop(t, SEED_AT[i], 0.4);
          if (s <= 0) return null;
          const q = { x: p.x + (targets[i].x - p.x) * fly, y: p.y + (targets[i].y - p.y) * fly };
          return (
            <g key={i} opacity={1 - ramp(t, hit + 0.22, hit + 0.3)}>
              <circle cx={q.x} cy={q.y} r={24 * s} fill={C.gold} opacity={0.3} filter="url(#glow)" />
              <circle cx={q.x} cy={q.y} r={13 * s} fill="#fff" />
            </g>
          );
        })}
        {t >= hit && <Logo cx={LOGO.cx} cy={LOGO.cy} r={LOGO.r} progress={easeOut(ramp(t, hit + 0.04, hit + 0.34))} spin={spin} dots={ramp(t, hit + 0.2, hit + 0.3)} />}
      </svg>
      {t >= hit && (
        <div style={{ position: "absolute", top: 630, width: 1920, textAlign: "center", fontFamily: FONT }}>
          <div style={{ fontSize: 132, fontWeight: 900, letterSpacing: 16, color: C.ink, transform: `scale(${pop(t, hit + 0.08, 0.6)})` }}>
            FAVOR <span style={{ color: C.gold }}>LOOP</span>
          </div>
          <div style={{ marginTop: 26, fontSize: 40, fontWeight: 700, color: C.gold, opacity: ramp(t, hit + 0.6, hit + 1.0) }}>
            Try it on Telegram: t.me/favor_loop_village_bot
          </div>
          <div style={{ marginTop: 16, fontSize: 28, fontWeight: 500, color: C.muted, opacity: ramp(t, hit + 0.9, hit + 1.3) }}>
            Built as an Agent Village mini-app for Edge City India · favorloop.fly.dev
          </div>
        </div>
      )}
      {t >= hit && <AbsoluteFill style={{ background: "#fff", opacity: 0.5 * (1 - ramp(t, hit, hit + 0.3)) }} />}
    </AbsoluteFill>
  );
};
