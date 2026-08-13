import { Position, PlayerMatchStats, ChipName, Pick } from "./types";
import { scorePlayerMatch, ScoreBreakdown, SCORING } from "./scoring";
import { applyAutoSubs, AutoSub, transferCost, RULES } from "./rules";

/** One player's contribution in a gameweek, ready to render. */
export type PlayerLine = {
  player_id: number;
  position: Position;
  slot: number;
  isCaptain: boolean;
  isVice: boolean;
  /** 0 when benched and not boosted, 1 normally, 2 or 3 with the armband */
  multiplier: number;
  minutes: number;
  /** Points the player scored, before any captain multiplier */
  rawPoints: number;
  /** What this player actually contributed to your total */
  points: number;
  breakdown: ScoreBreakdown;
  /** How many matches they played this gameweek. 2 means a double. */
  appearances: number;
  subbedOn: boolean;
  subbedOff: boolean;
  /** In the final eleven after auto-subs */
  counted: boolean;
};

export type GameweekView = {
  lines: PlayerLine[];
  starters: PlayerLine[];
  bench: PlayerLine[];
  autoSubs: AutoSub[];
  captainId: number | null;
  captainMultiplier: number;
  /** Points scored by the eleven, including the captain multiplier */
  starterPoints: number;
  /** Points left sitting on the bench */
  benchPoints: number;
  transfersMade: number;
  transferCost: number;
  chip: ChipName | null;
  /** starterPoints minus the transfer hit */
  total: number;
};

export type StatRow = { player_id: number } & Partial<PlayerMatchStats>;

export type BuildInput = {
  picks: Pick[];
  /** Position of every player in the squad */
  positions: Map<number, Position>;
  /** Raw match rows. A player appears once per fixture, so twice in a double. */
  stats: StatRow[];
  /** Bonus already awarded per player for the gameweek */
  bonus?: Map<number, number>;
  chip?: ChipName | null;
  transfersMade?: number;
  freeTransfers?: number;
};

const EMPTY: ScoreBreakdown = {
  minutes: 0, goals: 0, assists: 0, cleanSheet: 0, saves: 0, penaltySaves: 0,
  penaltyMisses: 0, goalsConceded: 0, cards: 0, ownGoals: 0,
  defensiveContribution: 0, bonus: 0, total: 0,
};

function addBreakdowns(a: ScoreBreakdown, b: ScoreBreakdown): ScoreBreakdown {
  return {
    minutes: a.minutes + b.minutes,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    cleanSheet: a.cleanSheet + b.cleanSheet,
    saves: a.saves + b.saves,
    penaltySaves: a.penaltySaves + b.penaltySaves,
    penaltyMisses: a.penaltyMisses + b.penaltyMisses,
    goalsConceded: a.goalsConceded + b.goalsConceded,
    cards: a.cards + b.cards,
    ownGoals: a.ownGoals + b.ownGoals,
    defensiveContribution: a.defensiveContribution + b.defensiveContribution,
    bonus: a.bonus + b.bonus,
    total: a.total + b.total,
  };
}

/**
 * Turn a set of picks and raw match stats into everything the Points page
 * needs. Recomputes from raw stats rather than trusting a stored total, so the
 * per-player breakdown always adds up to the number shown.
 */
export function buildGameweekView({
  picks, positions, stats, bonus, chip = null, transfersMade = 0, freeTransfers = RULES.freeTransfersPerGw,
}: BuildInput): GameweekView {
  // A player can have several rows in a double gameweek
  const rowsByPlayer = new Map<number, StatRow[]>();
  for (const row of stats) {
    const list = rowsByPlayer.get(row.player_id) ?? [];
    list.push(row);
    rowsByPlayer.set(row.player_id, list);
  }

  const minutes = new Map<number, number>();
  const rawPoints = new Map<number, number>();
  const breakdowns = new Map<number, ScoreBreakdown>();
  const appearances = new Map<number, number>();

  for (const pick of picks) {
    const position = positions.get(pick.player_id);
    const rows = rowsByPlayer.get(pick.player_id) ?? [];

    let mins = 0;
    let bd = { ...EMPTY };
    let played = 0;

    // Bonus is awarded per fixture, so spread it across a double evenly enough
    const totalBonus = bonus?.get(pick.player_id) ?? 0;
    rows.forEach((row, i) => {
      const share = i === 0 ? totalBonus : 0;
      const b = position ? scorePlayerMatch(position, row, share) : { ...EMPTY };
      bd = addBreakdowns(bd, b);
      mins += row.minutes ?? 0;
      if ((row.minutes ?? 0) > 0) played++;
    });

    minutes.set(pick.player_id, mins);
    rawPoints.set(pick.player_id, bd.total);
    breakdowns.set(pick.player_id, bd);
    appearances.set(pick.player_id, played);
  }

  const benchBoost = chip === "bboost";
  const autoSubs = benchBoost ? [] : applyAutoSubs({ picks, position: positions, minutes });

  const counted = new Set(picks.filter((p) => p.slot <= 11).map((p) => p.player_id));
  for (const s of autoSubs) { counted.delete(s.out); counted.add(s.in); }
  if (benchBoost) picks.forEach((p) => counted.add(p.player_id));

  // Vice takes over if the captain did not play
  const cap = picks.find((p) => p.is_captain) ?? null;
  const vice = picks.find((p) => p.is_vice_captain) ?? null;
  let captainId: number | null = cap?.player_id ?? null;
  if (captainId !== null && (minutes.get(captainId) ?? 0) === 0 && vice && (minutes.get(vice.player_id) ?? 0) > 0) {
    captainId = vice.player_id;
  }
  const captainMultiplier = chip === "3xc" ? 3 : 2;

  const subbedOn = new Set(autoSubs.map((s) => s.in));
  const subbedOff = new Set(autoSubs.map((s) => s.out));

  const lines: PlayerLine[] = picks.map((p) => {
    const isIn = counted.has(p.player_id);
    const raw = rawPoints.get(p.player_id) ?? 0;
    const mult = isIn ? (p.player_id === captainId ? captainMultiplier : 1) : 0;
    return {
      player_id: p.player_id,
      position: positions.get(p.player_id) ?? "MID",
      slot: p.slot,
      isCaptain: p.player_id === captainId,
      isVice: !!vice && vice.player_id === p.player_id,
      multiplier: mult,
      minutes: minutes.get(p.player_id) ?? 0,
      rawPoints: raw,
      points: raw * mult,
      breakdown: breakdowns.get(p.player_id) ?? { ...EMPTY },
      appearances: appearances.get(p.player_id) ?? 0,
      subbedOn: subbedOn.has(p.player_id),
      subbedOff: subbedOff.has(p.player_id),
      counted: isIn,
    };
  }).sort((a, b) => a.slot - b.slot);

  const starterPoints = lines.filter((l) => l.counted).reduce((t, l) => t + l.points, 0);
  const benchPoints = lines.filter((l) => !l.counted).reduce((t, l) => t + l.rawPoints, 0);
  const hit = transferCost({ transfersMade, freeTransfers, chip });

  return {
    lines,
    starters: lines.filter((l) => l.counted),
    bench: lines.filter((l) => !l.counted).sort((a, b) => a.slot - b.slot),
    autoSubs,
    captainId,
    captainMultiplier,
    starterPoints,
    benchPoints,
    transfersMade,
    transferCost: hit,
    chip,
    total: starterPoints - hit,
  };
}

/** Human readable rows for a player's scoring breakdown. */
export function breakdownRows(b: ScoreBreakdown): { label: string; points: number }[] {
  const rows: [string, number][] = [
    ["Minutes played", b.minutes],
    ["Goals", b.goals],
    ["Assists", b.assists],
    ["Clean sheet", b.cleanSheet],
    ["Saves", b.saves],
    ["Penalty saves", b.penaltySaves],
    ["Penalties missed", b.penaltyMisses],
    ["Goals conceded", b.goalsConceded],
    ["Cards", b.cards],
    ["Own goals", b.ownGoals],
    ["Defensive contribution", b.defensiveContribution],
    ["Bonus", b.bonus],
  ];
  return rows.filter(([, p]) => p !== 0).map(([label, points]) => ({ label, points }));
}
