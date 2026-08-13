/**
 * The weekly scoring pipeline, as pure functions.
 *
 * `scripts/process-gameweek.ts` does the database reads and writes and calls
 * into here. Keeping the arithmetic separate means the whole run can be
 * simulated against a fabricated gameweek without touching a live database,
 * which is the only honest way to test it before real people depend on it.
 */
import { Position, PlayerMatchStats, ChipName, Pick } from "./types";
import { scorePlayerMatch, calculateBps, awardBonus } from "./scoring";
import { scoreEntryGameweek, rolloverFreeTransfers } from "./rules";
import { computePriceChanges, sellingPrice, PriceInput, PriceChange } from "./pricing";

export type Fixture = {
  id: number;
  home_club_id: number;
  away_club_id: number;
  home_score: number | null;
  away_score: number | null;
};

export type StatRow = { id?: number; player_id: number; fixture_id: number } & Partial<PlayerMatchStats>;

export type ScoredStat = StatRow & {
  goals_conceded: number;
  bps: number;
  bonus: number;
  total_points: number;
};

/**
 * Score every performance in a gameweek.
 *
 * Goals conceded is derived from the scoreline rather than entered by hand,
 * which removes the most tedious and most error-prone part of stat entry.
 * Bonus is then ranked within each fixture, never across the gameweek.
 */
export function scoreFixtures(
  fixtures: Fixture[],
  stats: StatRow[],
  positionOf: Map<number, Position>,
  clubOf: Map<number, number>
): ScoredStat[] {
  const out: ScoredStat[] = [];

  for (const fx of fixtures) {
    const rows = stats.filter((s) => s.fixture_id === fx.id);
    if (!rows.length) continue;

    const withConceded = rows.map((r) => {
      const isHome = clubOf.get(r.player_id) === fx.home_club_id;
      const conceded = isHome ? (fx.away_score ?? 0) : (fx.home_score ?? 0);
      const pos = positionOf.get(r.player_id);
      const merged = { ...r, goals_conceded: conceded };
      return { row: merged, bps: pos ? calculateBps(pos, merged) : 0 };
    });

    const bonus = awardBonus(withConceded.map((w) => ({ player_id: w.row.player_id, bps: w.bps })));

    for (const w of withConceded) {
      const pos = positionOf.get(w.row.player_id);
      const b = bonus.get(w.row.player_id) ?? 0;
      const total = pos ? scorePlayerMatch(pos, w.row, b).total : 0;
      out.push({ ...w.row, bps: w.bps, bonus: b, total_points: total });
    }
  }

  return out;
}

export type SeasonTotals = {
  total_points: number; minutes: number; goals_scored: number; assists: number;
  clean_sheets: number; goals_conceded: number; own_goals: number;
  penalties_saved: number; penalties_missed: number; yellow_cards: number;
  red_cards: number; saves: number; bonus: number; bps: number;
};

const ZERO: SeasonTotals = {
  total_points: 0, minutes: 0, goals_scored: 0, assists: 0, clean_sheets: 0,
  goals_conceded: 0, own_goals: 0, penalties_saved: 0, penalties_missed: 0,
  yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 0,
};

/** Aggregate every scored performance so far into per-player season totals. */
export function rollupSeason(allStats: ScoredStat[]): Map<number, SeasonTotals> {
  const agg = new Map<number, SeasonTotals>();
  for (const s of allStats) {
    const a = { ...(agg.get(s.player_id) ?? ZERO) };
    a.total_points += s.total_points;
    a.minutes += s.minutes ?? 0;
    a.goals_scored += s.goals_scored ?? 0;
    a.assists += s.assists ?? 0;
    a.clean_sheets += (s.minutes ?? 0) >= 60 && s.goals_conceded === 0 ? 1 : 0;
    a.goals_conceded += s.goals_conceded ?? 0;
    a.own_goals += s.own_goals ?? 0;
    a.penalties_saved += s.penalties_saved ?? 0;
    a.penalties_missed += s.penalties_missed ?? 0;
    a.yellow_cards += s.yellow_cards ?? 0;
    a.red_cards += s.red_cards ?? 0;
    a.saves += s.saves ?? 0;
    a.bonus += s.bonus;
    a.bps += s.bps;
    agg.set(s.player_id, a);
  }
  return agg;
}

export type EntryInput = {
  id: string;
  total_points: number;
  free_transfers: number;
  picks: Pick[];
  chip?: ChipName | null;
  transfersMade?: number;
};

export type EntryResult = {
  id: string;
  points: number;
  total_points: number;
  points_on_bench: number;
  transfer_cost: number;
  free_transfers_next: number;
  chip: ChipName | null;
  captainId: number | null;
  autoSubs: { out: number; in: number }[];
};

/** Score every manager for the gameweek. */
export function scoreEntries(
  entries: EntryInput[],
  scored: ScoredStat[],
  positionOf: Map<number, Position>
): EntryResult[] {
  const points = new Map<number, number>();
  const minutes = new Map<number, number>();
  for (const s of scored) {
    points.set(s.player_id, (points.get(s.player_id) ?? 0) + s.total_points);
    minutes.set(s.player_id, (minutes.get(s.player_id) ?? 0) + (s.minutes ?? 0));
  }

  return entries.map((e) => {
    const res = scoreEntryGameweek({
      picks: e.picks,
      position: positionOf,
      minutes,
      points,
      chip: e.chip ?? null,
      transfersMade: e.transfersMade ?? 0,
      freeTransfers: e.free_transfers,
    });
    return {
      id: e.id,
      points: res.total,
      total_points: e.total_points + res.total,
      points_on_bench: res.benchPoints,
      transfer_cost: res.transferHit,
      free_transfers_next: rolloverFreeTransfers(e.free_transfers, e.transfersMade ?? 0, e.chip ?? null),
      chip: e.chip ?? null,
      captainId: res.captainId,
      autoSubs: res.autoSubs,
    };
  });
}

/** Overall ranks, highest total first, ties broken deterministically. */
export function rankEntries(results: EntryResult[]): Map<string, number> {
  const sorted = [...results].sort((a, b) => b.total_points - a.total_points || a.id.localeCompare(b.id));
  return new Map(sorted.map((r, i) => [r.id, i + 1]));
}

export type GameweekSummary = { average_score: number; highest_score: number };

export function summarise(results: EntryResult[]): GameweekSummary {
  if (!results.length) return { average_score: 0, highest_score: 0 };
  const scores = results.map((r) => r.points);
  return {
    average_score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    highest_score: Math.max(...scores),
  };
}

/** Price moves, plus the knock-on to what everyone can sell each player for. */
export function applyPricing(
  players: PriceInput[],
  activeManagers: number,
  nextPicks: { id: number; player_id: number; purchase_price: number; selling_price: number }[]
): { changes: PriceChange[]; sellingUpdates: { id: number; selling_price: number }[] } {
  const changes = computePriceChanges(players, activeManagers);
  const costNow = new Map<number, number>(players.map((p) => [p.player_id, p.now_cost]));
  for (const c of changes) costNow.set(c.player_id, c.to);

  const sellingUpdates: { id: number; selling_price: number }[] = [];
  for (const p of nextPicks) {
    const sp = sellingPrice(p.purchase_price, costNow.get(p.player_id) ?? p.purchase_price);
    if (sp !== p.selling_price) sellingUpdates.push({ id: p.id, selling_price: sp });
  }
  return { changes, sellingUpdates };
}
