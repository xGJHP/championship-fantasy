import { Position, Pick, ChipName } from "./types";

export const RULES = {
  budget: 1000,              // tenths of a million => GBP 100.0m
  squadSize: 15,
  maxPerClub: 3,
  squadQuota: { GK: 2, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  xiSize: 11,
  xiMin: { GK: 1, DEF: 3, MID: 2, FWD: 1 } as Record<Position, number>,
  xiMax: { GK: 1, DEF: 5, MID: 5, FWD: 3 } as Record<Position, number>,
  freeTransfersPerGw: 1,
  maxStoredFreeTransfers: 5,
  transferHitCost: 4,
};

export type SquadPlayer = { id: number; position: Position; club_id: number; cost: number };

export type Violation = { code: string; message: string };

/** Validate a full 15-man squad. Returns [] when the squad is legal. */
export function validateSquad(
  players: SquadPlayer[],
  budget = RULES.budget
): Violation[] {
  const v: Violation[] = [];

  if (players.length !== RULES.squadSize) {
    v.push({
      code: "SQUAD_SIZE",
      message: `You need ${RULES.squadSize} players. You have ${players.length}.`,
    });
  }

  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) {
    v.push({ code: "DUPLICATE", message: "The same player cannot be picked twice." });
  }

  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    const n = players.filter((p) => p.position === pos).length;
    const want = RULES.squadQuota[pos];
    if (n !== want) {
      v.push({
        code: `QUOTA_${pos}`,
        message: `You need exactly ${want} ${pos}. You have ${n}.`,
      });
    }
  }

  const byClub = new Map<number, number>();
  for (const p of players) byClub.set(p.club_id, (byClub.get(p.club_id) ?? 0) + 1);
  for (const [clubId, n] of byClub) {
    if (n > RULES.maxPerClub) {
      v.push({
        code: "CLUB_LIMIT",
        message: `Max ${RULES.maxPerClub} players from one club. You have ${n} (club ${clubId}).`,
      });
    }
  }

  const spend = players.reduce((t, p) => t + p.cost, 0);
  if (spend > budget) {
    v.push({
      code: "BUDGET",
      message: `Over budget by ${fmtMoney(spend - budget)}.`,
    });
  }

  return v;
}

/** Validate the starting XI within an already-legal squad. */
export function validateXI(xi: SquadPlayer[]): Violation[] {
  const v: Violation[] = [];
  if (xi.length !== RULES.xiSize) {
    v.push({ code: "XI_SIZE", message: `Your XI must have ${RULES.xiSize} players.` });
  }
  for (const pos of ["GK", "DEF", "MID", "FWD"] as Position[]) {
    const n = xi.filter((p) => p.position === pos).length;
    if (n < RULES.xiMin[pos]) {
      v.push({ code: `XI_MIN_${pos}`, message: `You need at least ${RULES.xiMin[pos]} ${pos}.` });
    }
    if (n > RULES.xiMax[pos]) {
      v.push({ code: `XI_MAX_${pos}`, message: `You can play at most ${RULES.xiMax[pos]} ${pos}.` });
    }
  }
  return v;
}

export function isValidFormation(counts: Record<Position, number>): boolean {
  const total = counts.GK + counts.DEF + counts.MID + counts.FWD;
  if (total !== RULES.xiSize) return false;
  return (["GK", "DEF", "MID", "FWD"] as Position[]).every(
    (p) => counts[p] >= RULES.xiMin[p] && counts[p] <= RULES.xiMax[p]
  );
}

export function formationString(counts: Record<Position, number>): string {
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

export type Formation = { DEF: number; MID: number; FWD: number };

/**
 * Every legal shape, derived from the min and max rules rather than hardcoded,
 * so changing RULES.xiMin or xiMax cannot leave a stale list behind.
 */
export function validFormations(): Formation[] {
  const out: Formation[] = [];
  for (let d = RULES.xiMin.DEF; d <= RULES.xiMax.DEF; d++) {
    for (let m = RULES.xiMin.MID; m <= RULES.xiMax.MID; m++) {
      for (let f = RULES.xiMin.FWD; f <= RULES.xiMax.FWD; f++) {
        if (1 + d + m + f === RULES.xiSize) out.push({ DEF: d, MID: m, FWD: f });
      }
    }
  }
  return out;
}

export function parseFormation(s: string): Formation | null {
  const m = s.match(/^(\d)-(\d)-(\d)$/);
  if (!m) return null;
  const f = { DEF: +m[1], MID: +m[2], FWD: +m[3] };
  return validFormations().some((v) => v.DEF === f.DEF && v.MID === f.MID && v.FWD === f.FWD)
    ? f
    : null;
}

/** GBP formatting from tenths of a million. 55 -> "£5.5m" */
export function fmtMoney(tenths: number): string {
  const sign = tenths < 0 ? "-" : "";
  return `${sign}£${(Math.abs(tenths) / 10).toFixed(1)}m`;
}

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */

export type TransferCostInput = {
  transfersMade: number;
  freeTransfers: number;
  chip?: ChipName | null;
};

/** Point hit for a set of transfers. Wildcard and Free Hit make it free. */
export function transferCost({ transfersMade, freeTransfers, chip }: TransferCostInput): number {
  if (chip === "wildcard" || chip === "freehit") return 0;
  const paid = Math.max(0, transfersMade - freeTransfers);
  return paid * RULES.transferHitCost;
}

/** Free transfers carried into the next gameweek. */
export function rolloverFreeTransfers(
  current: number,
  transfersMade: number,
  chip?: ChipName | null
): number {
  if (chip === "wildcard" || chip === "freehit") return Math.max(1, current);
  const left = Math.max(0, current - transfersMade);
  return Math.min(RULES.maxStoredFreeTransfers, left + RULES.freeTransfersPerGw);
}

/* ------------------------------------------------------------------ */
/* Auto substitutions                                                  */
/* ------------------------------------------------------------------ */

export type AutoSubInput = {
  picks: Pick[];
  position: Map<number, Position>;
  minutes: Map<number, number>;
};

export type AutoSub = { out: number; in: number };

/**
 * Apply FPL auto-subs. Any starter on 0 minutes is replaced by the first
 * eligible bench player who played, keeping the formation legal.
 * Bench order is slot 12, 13, 14, 15. Slot 12 is the reserve keeper.
 */
export function applyAutoSubs({ picks, position, minutes }: AutoSubInput): AutoSub[] {
  const subs: AutoSub[] = [];
  const played = (id: number) => (minutes.get(id) ?? 0) > 0;

  const starters = picks.filter((p) => p.slot <= 11).map((p) => p.player_id);
  const bench = picks
    .filter((p) => p.slot >= 12)
    .sort((a, b) => a.slot - b.slot)
    .map((p) => p.player_id);

  const xi = new Set(starters);
  const usedBench = new Set<number>();

  const counts = (): Record<Position, number> => {
    const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const id of xi) c[position.get(id)!]++;
    return c;
  };

  for (const starterId of starters) {
    if (played(starterId)) continue;
    const starterPos = position.get(starterId)!;

    for (const benchId of bench) {
      if (usedBench.has(benchId)) continue;
      if (!played(benchId)) continue;

      const benchPos = position.get(benchId)!;

      // Keepers only ever swap with keepers
      if ((starterPos === "GK") !== (benchPos === "GK")) continue;

      const c = counts();
      c[starterPos]--;
      c[benchPos]++;
      if (!isValidFormation(c)) continue;

      xi.delete(starterId);
      xi.add(benchId);
      usedBench.add(benchId);
      subs.push({ out: starterId, in: benchId });
      break;
    }
  }

  return subs;
}

/* ------------------------------------------------------------------ */
/* Gameweek scoring for an entry                                       */
/* ------------------------------------------------------------------ */

export type EntryScoreInput = {
  picks: Pick[];
  position: Map<number, Position>;
  minutes: Map<number, number>;
  points: Map<number, number>;
  chip?: ChipName | null;
  transfersMade?: number;
  freeTransfers?: number;
};

export type EntryScore = {
  starterPoints: number;
  benchPoints: number;
  captainId: number | null;
  captainMultiplier: number;
  autoSubs: AutoSub[];
  transferHit: number;
  total: number;
};

export function scoreEntryGameweek(input: EntryScoreInput): EntryScore {
  const { picks, position, minutes, points, chip } = input;
  const pts = (id: number) => points.get(id) ?? 0;
  const mins = (id: number) => minutes.get(id) ?? 0;

  const benchBoost = chip === "bboost";
  const autoSubs = benchBoost ? [] : applyAutoSubs({ picks, position, minutes });

  const xi = new Set(picks.filter((p) => p.slot <= 11).map((p) => p.player_id));
  for (const s of autoSubs) {
    xi.delete(s.out);
    xi.add(s.in);
  }
  if (benchBoost) for (const p of picks) xi.add(p.player_id);

  // Captaincy: vice takes over if the captain did not play
  const cap = picks.find((p) => p.is_captain) ?? null;
  const vice = picks.find((p) => p.is_vice_captain) ?? null;
  let captainId: number | null = cap?.player_id ?? null;
  if (captainId !== null && mins(captainId) === 0 && vice && mins(vice.player_id) > 0) {
    captainId = vice.player_id;
  }
  const captainMultiplier = chip === "3xc" ? 3 : 2;

  let starterPoints = 0;
  for (const id of xi) {
    const base = pts(id);
    starterPoints += id === captainId ? base * captainMultiplier : base;
  }

  let benchPoints = 0;
  if (!benchBoost) {
    for (const p of picks) {
      if (!xi.has(p.player_id)) benchPoints += pts(p.player_id);
    }
  }

  const transferHit = transferCost({
    transfersMade: input.transfersMade ?? 0,
    freeTransfers: input.freeTransfers ?? RULES.freeTransfersPerGw,
    chip,
  });

  return {
    starterPoints,
    benchPoints,
    captainId,
    captainMultiplier,
    autoSubs,
    transferHit,
    total: starterPoints - transferHit,
  };
}
