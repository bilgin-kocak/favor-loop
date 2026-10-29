import { describe, expect, test } from "bun:test";
import { edgeFavor, findMatches, groupKey, type Candidate } from "../src/matcher";

const m = (id: string, offers: string[], wants: string[], giftOnly = false): Candidate => ({ id, offers, wants, giftOnly });

describe("matcher", () => {
  test("finds a three-loop when no two could swap", () => {
    const a = m("a", ["code_review"], ["portrait_photo"]);
    const b = m("b", ["portrait_photo"], ["stretch_session"]);
    const c = m("c", ["stretch_session"], ["code_review"]);
    const [loop, ...rest] = findMatches([a, b, c]);
    expect(rest).toHaveLength(0);
    expect(loop.shape).toBe("loop3");
    // A reviews C's code, C teaches B yoga, B takes A's portrait.
    expect(loop.members).toEqual(["a", "c", "b"]);
    expect(loop.edges).toEqual([
      { giver: "a", receiver: "c", favor: "code_review" },
      { giver: "c", receiver: "b", favor: "stretch_session" },
      { giver: "b", receiver: "a", favor: "portrait_photo" },
    ]);
  });

  test("finds a gift chain G -> X -> Y from a member who only gives", () => {
    const g = m("g", ["code_review"], [], true);
    const x = m("x", ["portrait_photo"], ["code_review"]);
    const y = m("y", ["goa_tips"], ["portrait_photo"]);
    const [chain] = findMatches([g, x, y]);
    expect(chain.shape).toBe("chain");
    expect(chain.members).toEqual(["g", "x", "y"]);
    expect(chain.edges).toEqual([
      { giver: "g", receiver: "x", favor: "code_review" },
      { giver: "x", receiver: "y", favor: "portrait_photo" },
    ]);
  });

  test("a gift chain can be just G -> X", () => {
    const [chain] = findMatches([m("g", ["music_lesson"], [], true), m("x", ["goa_tips"], ["music_lesson"])]);
    expect(chain.shape).toBe("chain");
    expect(chain.edges).toEqual([{ giver: "g", receiver: "x", favor: "music_lesson" }]);
  });

  test("finds two-way swaps", () => {
    const [swap] = findMatches([m("a", ["code_review"], ["portrait_photo"]), m("b", ["portrait_photo"], ["code_review"])]);
    expect(swap.shape).toBe("swap");
    expect(swap.edges).toHaveLength(2);
  });

  test("prefers a three-loop over a swap", () => {
    const a = m("a", ["code_review"], ["portrait_photo"]);
    const b = m("b", ["portrait_photo"], ["stretch_session", "code_review"]);
    const c = m("c", ["stretch_session"], ["code_review"]);
    const result = findMatches([a, b, c]);
    expect(result.map(r => r.shape)).toEqual(["loop3"]);
  });

  test("an edge carries the first matching favor in menu order", () => {
    expect(edgeFavor(m("a", ["goa_tips", "code_review"], []), m("b", [], ["goa_tips", "code_review"]))).toBe("code_review");
    expect(edgeFavor(m("a", ["goa_tips"], []), m("b", [], ["code_review"]))).toBeNull();
  });

  test("results are vertex-disjoint", () => {
    const ids = ["code_review", "portrait_photo", "stretch_session", "pitch_feedback", "cv_review", "design_feedback"];
    const people: Candidate[] = [];
    for (let i = 0; i < 60; i++) {
      const offers = [ids[i % 6], ids[(i * 5 + 1) % 6]].filter((v, j, all) => all.indexOf(v) === j);
      const wants = [ids[(i + 2) % 6], ids[(i * 7 + 3) % 6]].filter(w => !offers.includes(w)).filter((v, j, all) => all.indexOf(v) === j);
      people.push(m(`p${i}`, offers, wants.length ? wants : [ids[(i + 4) % 6]].filter(w => !offers.includes(w)), false));
    }
    people.push(m("g1", ["code_review"], [], true), m("g2", ["portrait_photo"], [], true));
    const result = findMatches(people);
    const seen = result.flatMap(r => r.members);
    expect(result.length).toBeGreaterThan(5);
    expect(new Set(seen).size).toBe(seen.length);
    for (const r of result) for (const e of r.edges) {
      const giver = people.find(p => p.id === e.giver)!;
      const receiver = people.find(p => p.id === e.receiver)!;
      expect(giver.offers).toContain(e.favor);
      expect(receiver.wants).toContain(e.favor);
    }
  });

  test("never re-proposes a blocked group", () => {
    const a = m("a", ["code_review"], ["portrait_photo"]);
    const b = m("b", ["portrait_photo"], ["stretch_session"]);
    const c = m("c", ["stretch_session"], ["code_review"]);
    expect(findMatches([a, b, c], new Set([groupKey(["c", "a", "b"])]))).toEqual([]);
  });

  test("a blocked loop still leaves other groups possible", () => {
    const a = m("a", ["code_review"], ["portrait_photo"]);
    const b = m("b", ["portrait_photo"], ["stretch_session", "code_review"]);
    const c = m("c", ["stretch_session"], ["code_review"]);
    const result = findMatches([a, b, c], new Set([groupKey(["a", "b", "c"])]));
    expect(result).toHaveLength(1);
    expect(result[0].shape).toBe("swap");
    expect(result[0].members).toEqual(["a", "b"]);
  });
});
