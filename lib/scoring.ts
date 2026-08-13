import { Position, PlayerMatchStats, EMPTY_STATS } from "./types";

/**
 * Scoring configuration. Everything lives here so the rules can be tuned
 * without touching the engine. Defaults mirror Fantasy Premier League.
 */
export const SCORING = {
  minutesShort: 1,        // played 1-59 minutes
  minutesLong: 2,         // played 60+ minutes
  minutesLongThreshold: 60,

  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 } as Record<Position, number>,
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 } as Record<Position, number>,

  savesPerPoint: 3,
  penaltySave: 5,
  penaltyMiss: -2,

  /** -1 for every N goals conceded, GK and DEF only */
  concededPerPenalty: 2,
  concededAppliesTo: ["GK", "DEF"] as Position[],

  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,

  bonus: [3, 2, 1],

  /**
   * Defensive Contribution, as added to FPL in 2025/26.
   * OFF by default because it needs Opta-grade event data you probably
   * will not have on a free feed. Flip `enabled` on once you do.
   */
  defensiveContribution: {
    enabled: false,
    points: 2,
    defThreshold: 10,   // DEF: clearances + blocks + interceptions + tackles
    midFwdThreshold: 12, // MID/FWD: the above + recoveries
  },
};

/**
 * BPS (Bonus Points System) weights.
 * `core` uses only stats a human can realistically enter from a match report.
 * `extended` items are applied only when the value is supplied.
 */
export const BPS = {
  minutesShort: 3,
  minutesLong: 6,
  goal: { GK: 12, DEF: 12, MID: 18, FWD: 24 } as Record<Position, number>,
  assist: 9,
  cleanSheet: { GK: 12, DEF: 12, MID: 0, FWD: 0 } as Record<Position, number>,
  penaltySave: 15,
  save: 2,
  penaltyMiss: -6,
  yellowCard: -3,
  redCard: -9,
  ownGoal: -6,
  // extended
  cbitPer: 2,          // 1 BPS per 2 clearances/blocks/interceptions
  recoveriesPer: 3,    // 1 BPS per 3 recoveries
  tackle: 2,
  keyPass: 1,
  bigChanceCreated: 3,
  bigChanceMissed: -3,
  errorLeadingToGoal: -3,
  penaltyConceded: -3,
};

export type ScoreBreakdown = {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  saves: number;
  penaltySaves: number;
  penaltyMisses: number;
  goalsConceded: number;
  cards: number;
  ownGoals: number;
  defensiveContribution: number;
  bonus: number;
  total: number;
};

const int = (n: number | undefined) => (Number.isFinite(n) ? Math.trunc(n as number) : 0);

/**
 * Points a player scored in a single match, excluding bonus.
 * Pass `bonus` separately once BPS has been ranked across the fixture.
 */
export function scorePlayerMatch(
  position: Position,
  raw: Partial<PlayerMatchStats>,
  bonus = 0
): ScoreBreakdown {
  const s: PlayerMatchStats = { ...EMPTY_STATS, ...raw };
  const played = s.minutes > 0;

  const b: ScoreBreakdown = {
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheet: 0,
    saves: 0,
    penaltySaves: 0,
    penaltyMisses: 0,
    goalsConceded: 0,
    cards: 0,
    ownGoals: 0,
    defensiveContribution: 0,
    bonus: int(bonus),
    total: 0,
  };

  if (!played) return b; // did not play, zero points, nothing else applies

  b.minutes =
    s.minutes >= SCORING.minutesLongThreshold ? SCORING.minutesLong : SCORING.minutesShort;

  b.goals = int(s.goals_scored) * SCORING.goal[position];
  b.assists = int(s.assists) * SCORING.assist;

  // Clean sheet only counts if the player was on for at least 60 minutes
  if (s.minutes >= SCORING.minutesLongThreshold && int(s.goals_conceded) === 0) {
    b.cleanSheet = SCORING.cleanSheet[position];
  }

  b.saves = Math.floor(int(s.saves) / SCORING.savesPerPoint);
  b.penaltySaves = int(s.penalties_saved) * SCORING.penaltySave;
  b.penaltyMisses = int(s.penalties_missed) * SCORING.penaltyMiss;

  if (SCORING.concededAppliesTo.includes(position)) {
    b.goalsConceded = -Math.floor(int(s.goals_conceded) / SCORING.concededPerPenalty);
  }

  b.cards = int(s.yellow_cards) * SCORING.yellowCard + int(s.red_cards) * SCORING.redCard;
  b.ownGoals = int(s.own_goals) * SCORING.ownGoal;

  if (SCORING.defensiveContribution.enabled) {
    const cfg = SCORING.defensiveContribution;
    const cbit = int(s.clearances_blocks_interceptions) + int(s.tackles);
    if (position === "DEF") {
      if (cbit >= cfg.defThreshold) b.defensiveContribution = cfg.points;
    } else if (position === "MID" || position === "FWD") {
      if (cbit + int(s.recoveries) >= cfg.midFwdThreshold) b.defensiveContribution = cfg.points;
    }
  }

  b.total =
    b.minutes + b.goals + b.assists + b.cleanSheet + b.saves + b.penaltySaves +
    b.penaltyMisses + b.goalsConceded + b.cards + b.ownGoals +
    b.defensiveContribution + b.bonus;

  return b;
}

/** BPS total for one player in one match. */
export function calculateBps(position: Position, raw: Partial<PlayerMatchStats>): number {
  const s: PlayerMatchStats = { ...EMPTY_STATS, ...raw };
  if (s.minutes <= 0) return 0;

  let bps = s.minutes >= SCORING.minutesLongThreshold ? BPS.minutesLong : BPS.minutesShort;

  bps += int(s.goals_scored) * BPS.goal[position];
  bps += int(s.assists) * BPS.assist;

  if (s.minutes >= SCORING.minutesLongThreshold && int(s.goals_conceded) === 0) {
    bps += BPS.cleanSheet[position];
  }

  bps += int(s.saves) * BPS.save;
  bps += int(s.penalties_saved) * BPS.penaltySave;
  bps += int(s.penalties_missed) * BPS.penaltyMiss;
  bps += int(s.yellow_cards) * BPS.yellowCard;
  bps += int(s.red_cards) * BPS.redCard;
  bps += int(s.own_goals) * BPS.ownGoal;

  // Extended stats, applied only when present
  bps += Math.floor(int(s.clearances_blocks_interceptions) / BPS.cbitPer);
  bps += Math.floor(int(s.recoveries) / BPS.recoveriesPer);
  bps += int(s.tackles) * BPS.tackle;
  bps += int(s.key_passes) * BPS.keyPass;
  bps += int(s.big_chances_created) * BPS.bigChanceCreated;
  bps += int(s.big_chances_missed) * BPS.bigChanceMissed;
  bps += int(s.errors_leading_to_goal) * BPS.errorLeadingToGoal;
  bps += int(s.penalties_conceded) * BPS.penaltyConceded;

  return bps;
}

export type BpsRow = { player_id: number; bps: number };

/**
 * Award 3/2/1 bonus across a single fixture, handling ties the way FPL does:
 * tied on top -> both get 3, next gets 1. Tied on second -> both get 2, no 1.
 */
export function awardBonus(rows: BpsRow[]): Map<number, number> {
  const out = new Map<number, number>();
  const eligible = rows.filter((r) => r.bps > 0);
  if (eligible.length === 0) return out;

  const tiers = [...new Set(eligible.map((r) => r.bps))].sort((a, b) => b - a);

  let awardIndex = 0; // 0 -> 3pts, 1 -> 2pts, 2 -> 1pt
  for (const tier of tiers) {
    if (awardIndex > 2) break;
    const points = SCORING.bonus[awardIndex];
    const group = eligible.filter((r) => r.bps === tier);
    for (const r of group) out.set(r.player_id, points);
    // A tie of N players consumes N award slots
    awardIndex += group.length;
  }

  return out;
}
