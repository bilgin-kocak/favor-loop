// The matcher: pure, no I/O. An edge A -> B exists when A offers something B wants; it carries the first
// such favor in menu order. Selection is greedy and vertex-disjoint: three-loops first, then gift chains,
// then two-way swaps, scanning members in the order given (earliest joined first).
import { FAVOR_IDS } from "./menu";

export type Candidate = { id: string; offers: readonly string[]; wants: readonly string[]; giftOnly: boolean };
export type Shape = "loop3" | "chain" | "swap";
export type MatchEdge = { giver: string; receiver: string; favor: string };
/** members are in loop order; edges[i] goes from members[i] to the next member (a chain does not close). */
export type Proposal = { shape: Shape; members: string[]; edges: MatchEdge[] };

/** The same group of people, whatever the shape or order. */
export const groupKey = (ids: readonly string[]) => [...ids].sort().join(",");

const RANK = new Map(FAVOR_IDS.map((id, i) => [id, i]));

/** The favor on the edge giver -> receiver, or null when there is no edge. */
export function edgeFavor(giver: Candidate, receiver: Candidate): string | null {
  if (giver.id === receiver.id) return null;
  let best: string | null = null;
  for (const favor of giver.offers) {
    if (!receiver.wants.includes(favor)) continue;
    if (best === null || (RANK.get(favor) ?? 99) < (RANK.get(best) ?? 99)) best = favor;
  }
  return best;
}

export function findMatches(candidates: readonly Candidate[], blocked: ReadonlySet<string> = new Set()): Proposal[] {
  // Receivers of each member, in candidate order.
  const out = new Map<string, Candidate[]>();
  for (const a of candidates) out.set(a.id, candidates.filter(b => edgeFavor(a, b) !== null));

  const used = new Set<string>();
  const free = (c: Candidate) => !used.has(c.id);
  const allowed = (group: Candidate[]) => !blocked.has(groupKey(group.map(c => c.id)));
  const proposals: Proposal[] = [];
  const take = (shape: Shape, group: Candidate[]) => {
    const closes = shape !== "chain";
    const edges: MatchEdge[] = [];
    for (let i = 0; i < group.length - (closes ? 0 : 1); i++) {
      const giver = group[i];
      const receiver = group[(i + 1) % group.length];
      edges.push({ giver: giver.id, receiver: receiver.id, favor: edgeFavor(giver, receiver)! });
    }
    proposals.push({ shape, members: group.map(c => c.id), edges });
    for (const c of group) used.add(c.id);
  };

  // 1. Three-loops: A -> B -> C -> A.
  for (const a of candidates) {
    if (!free(a)) continue;
    search: for (const b of out.get(a.id)!) {
      if (!free(b)) continue;
      for (const c of out.get(b.id)!) {
        if (!free(c) || c.id === a.id || edgeFavor(c, a) === null || !allowed([a, b, c])) continue;
        take("loop3", [a, b, c]);
        break search;
      }
    }
  }

  // 2. Gift chains from a member who only wants to give: G -> X -> Y if possible, else G -> X.
  for (const g of candidates) {
    if (!g.giftOnly || !free(g)) continue;
    let chain: Candidate[] | null = null;
    search: for (const x of out.get(g.id)!) {
      if (!free(x)) continue;
      for (const y of out.get(x.id)!) {
        if (!free(y) || y.id === g.id || !allowed([g, x, y])) continue;
        chain = [g, x, y];
        break search;
      }
    }
    chain ??= (() => {
      const x = out.get(g.id)!.find(x => free(x) && allowed([g, x]));
      return x ? [g, x] : null;
    })();
    if (chain) take("chain", chain);
  }

  // 3. Two-way swaps: A <-> B.
  for (const a of candidates) {
    if (!free(a)) continue;
    const b = out.get(a.id)!.find(b => free(b) && edgeFavor(b, a) !== null && allowed([a, b]));
    if (b) take("swap", [a, b]);
  }
  return proposals;
}
