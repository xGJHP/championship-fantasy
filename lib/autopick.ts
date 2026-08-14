import { Position } from "./types";
import { RULES, validFormations, fmtMoney } from "./rules";

export type PickablePlayer = {
  id: number;
  club_id: number;
  position: Position;
  now_cost: number;
  total_points: number;
  status?: string;
};

export type AutoPickResult = {
  squad: PickablePlayer[];
  xi: number[];
  captainId: number | null;
  viceId: number | null;
  spend: number;
  bank: number;
  /** Players the manager had already chosen, left exactly as they were. */
  kept: number[];
  /** Players auto pick added to complete the squad. */
  added: number[];
};

export type AutoPickOutcome =
  | ({ ok: true } & AutoPickResult)
  | { ok: false; reason: string };

export type AutoPickOptions = {
  /** Player ids the manager has already chosen. These are never changed. */
  keep?: number[];
};

/**
 * Complete a squad.
 *
 * With no options it builds a full 15 from scratch. Given `keep`, it treats
 * those players as fixed and fills whatever is missing around them, which is
 * how most people actually use it: pick the four or five you care about, then
 * let the rest sort itself out.
 *
 * Two passes, so a part-filled squad is structurally impossible. First fill
 * every empty slot with the cheapest legal option, which is always affordable
 * if anything is. Then spend what is left upgrading, touching only the players
 * it added.
 */
export function autoPickSquad(
  all: PickablePlayer[],
  options: AutoPickOptions = {}
): AutoPickOutcome {
  const byId = new Map(all.map((p) => [p.id, p]));
  const keepIds = [...new Set(options.keep ?? [])];

  const kept: PickablePlayer[] = [];
  for (const id of keepIds) {
    const p = byId.get(id);
    if (!p) return { ok: false, reason: "One of your players is no longer in the game." };
    kept.push(p);
  }

  /* Whatever they have already picked must itself be legal */
  if (kept.length > RULES.squadSize) {
    return { ok: false, reason: `You already have more than ${RULES.squadSize} players.` };
  }

  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    const n = kept.filter((p) => p.position === pos).length;
    if (n > RULES.squadQuota[pos]) {
      return { ok: false, reason: `You have ${n} ${pos}, and the limit is ${RULES.squadQuota[pos]}.` };
    }
  }

  const keptByClub = new Map<number, number>();
  kept.forEach((p) => keptByClub.set(p.club_id, (keptByClub.get(p.club_id) ?? 0) + 1));
  for (const [, n] of keptByClub) {
    if (n > RULES.maxPerClub) {
      return { ok: false, reason: `You have more than ${RULES.maxPerClub} players from one club.` };
    }
  }

  const keptSpend = kept.reduce((t, p) => t + p.now_cost, 0);
  if (keptSpend > RULES.budget) {
    return { ok: false, reason: `Your current players are ${fmtMoney(keptSpend - RULES.budget)} over budget.` };
  }

  if (kept.length === RULES.squadSize) {
    return finish(kept, [], kept.map((p) => p.id), [], anyPointsIn(all));
  }

  /* Everyone still available to be added */
  const keptSet = new Set(kept.map((p) => p.id));
  const healthy = all.filter((p) => !keptSet.has(p.id) && (!p.status || p.status === "a"));
  const pool = healthy.length ? healthy : all.filter((p) => !keptSet.has(p.id));

  const anyPoints = anyPointsIn(all);
  const value = (p: PickablePlayer) => (anyPoints ? p.total_points : p.now_cost);

  /* Pass one: cheapest legal filler for every empty slot */
  const added: PickablePlayer[] = [];
  const clubCount = new Map(keptByClub);
  const usedIds = new Set(keptSet);

  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    const stillNeed = RULES.squadQuota[pos] - kept.filter((p) => p.position === pos).length;
    if (stillNeed <= 0) continue;

    const candidates = pool
      .filter((p) => p.position === pos && !usedIds.has(p.id))
      .sort((a, b) => a.now_cost - b.now_cost || value(b) - value(a));

    let taken = 0;
    for (const p of candidates) {
      if (taken === stillNeed) break;
      if ((clubCount.get(p.club_id) ?? 0) >= RULES.maxPerClub) continue;
      added.push(p);
      usedIds.add(p.id);
      clubCount.set(p.club_id, (clubCount.get(p.club_id) ?? 0) + 1);
      taken++;
    }
    if (taken < stillNeed) {
      return { ok: false, reason: `Not enough ${pos} available to complete your squad.` };
    }
  }

  let spend = keptSpend + added.reduce((t, p) => t + p.now_cost, 0);
  if (spend > RULES.budget) {
    return {
      ok: false,
      reason: `Your players are too expensive to build a full squad around. You would be ${fmtMoney(spend - RULES.budget)} over, so sell someone first.`,
    };
  }

  /* Pass two: spend the rest, but only ever on players auto pick added */
  const MAX_STEPS = 400;
  for (let step = 0; step < MAX_STEPS; step++) {
    let best: { outIdx: number; inPlayer: PickablePlayer; gain: number } | null = null;
    const bank = RULES.budget - spend;

    for (let i = 0; i < added.length; i++) {
      const out = added[i];
      for (const cand of pool) {
        if (cand.position !== out.position) continue;
        if (usedIds.has(cand.id)) continue;
        const delta = cand.now_cost - out.now_cost;
        if (delta > bank) continue;
        const gain = value(cand) - value(out);
        if (gain <= 0) continue;
        const sameClub =
          (clubCount.get(cand.club_id) ?? 0) - (cand.club_id === out.club_id ? 1 : 0);
        if (sameClub >= RULES.maxPerClub) continue;
        if (!best || gain > best.gain || (gain === best.gain && delta < 0)) {
          best = { outIdx: i, inPlayer: cand, gain };
        }
      }
    }

    if (!best) break;
    const out = added[best.outIdx];
    usedIds.delete(out.id);
    usedIds.add(best.inPlayer.id);
    clubCount.set(out.club_id, (clubCount.get(out.club_id) ?? 1) - 1);
    clubCount.set(best.inPlayer.club_id, (clubCount.get(best.inPlayer.club_id) ?? 0) + 1);
    spend += best.inPlayer.now_cost - out.now_cost;
    added[best.outIdx] = best.inPlayer;
  }

  return finish([...kept, ...added], added, kept.map((p) => p.id), added.map((p) => p.id), anyPoints);
}

function anyPointsIn(all: PickablePlayer[]) {
  return all.some((p) => p.total_points > 0);
}

/** Choose the best legal eleven from a complete squad, plus the armband. */
function finish(
  squad: PickablePlayer[],
  _added: PickablePlayer[],
  keptIds: number[],
  addedIds: number[],
  anyPoints: boolean
): AutoPickOutcome {
  const value = (p: PickablePlayer) => (anyPoints ? p.total_points : p.now_cost);

  let bestXi: PickablePlayer[] = [];
  let bestValue = -Infinity;

  for (const f of validFormations()) {
    const target: Record<Position, number> = { GK: 1, ...f };
    const xi: PickablePlayer[] = [];
    let ok = true;
    for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
      const inPos = squad
        .filter((p) => p.position === pos)
        .sort((a, b) => value(b) - value(a))
        .slice(0, target[pos]);
      if (inPos.length < target[pos]) { ok = false; break; }
      xi.push(...inPos);
    }
    if (!ok) continue;
    const total = xi.reduce((t, p) => t + value(p), 0);
    if (total > bestValue) { bestValue = total; bestXi = xi; }
  }

  if (bestXi.length !== RULES.xiSize) {
    return { ok: false, reason: "Could not put together a legal starting eleven." };
  }

  const ranked = [...bestXi].sort((a, b) => value(b) - value(a));
  const spend = squad.reduce((t, p) => t + p.now_cost, 0);

  return {
    ok: true,
    squad,
    xi: bestXi.map((p) => p.id),
    captainId: ranked[0]?.id ?? null,
    viceId: ranked[1]?.id ?? null,
    spend,
    bank: RULES.budget - spend,
    kept: keptIds,
    added: addedIds,
  };
}
