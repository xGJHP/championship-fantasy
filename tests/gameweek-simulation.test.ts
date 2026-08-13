import { describe, it, expect } from "vitest";
import {
  scoreFixtures, rollupSeason, scoreEntries, rankEntries, summarise, applyPricing,
  Fixture, StatRow,
} from "../lib/process";
import { Position, Pick, ChipName } from "../lib/types";
import { SCORING, scorePlayerMatch } from "../lib/scoring";
import { RULES, isValidFormation } from "../lib/rules";
import { isValidStartPrice } from "../lib/pricing";

/* ------------------------------------------------------------------ *
 * A whole fabricated gameweek: 24 clubs, 12 fixtures, 20 players each *
 * ------------------------------------------------------------------ */

const CLUBS = Array.from({ length: 24 }, (_, i) => i + 1);
const SHAPE: Position[] = [
  "GK", "GK",
  "DEF", "DEF", "DEF", "DEF", "DEF", "DEF",
  "MID", "MID", "MID", "MID", "MID", "MID", "MID",
  "FWD", "FWD", "FWD", "FWD", "FWD",
];

type P = { id: number; club_id: number; position: Position; cost: number };
const players: P[] = [];
let pid = 1;
for (const club of CLUBS) {
  SHAPE.forEach((position, i) => {
    players.push({ id: pid++, club_id: club, position, cost: 40 + (i % 9) * 5 });
  });
}
const positionOf = new Map<number, Position>(players.map((p) => [p.id, p.position]));
const clubOf = new Map<number, number>(players.map((p) => [p.id, p.club_id]));
const squadOf = (club: number) => players.filter((p) => p.club_id === club);

// 12 fixtures pairing all 24 clubs, with plausible scorelines
const SCORES: [number, number][] = [
  [2, 1], [0, 0], [3, 2], [1, 0], [0, 2], [1, 1],
  [4, 0], [2, 2], [0, 1], [3, 1], [1, 2], [0, 3],
];
const fixtures: Fixture[] = SCORES.map(([h, a], i) => ({
  id: i + 1,
  home_club_id: CLUBS[i * 2],
  away_club_id: CLUBS[i * 2 + 1],
  home_score: h,
  away_score: a,
}));

/** Deterministic pseudo-random, so a failure is always reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Build stats for a fixture: 11 starters plus 3 subs a side, goals matching the score. */
function statsForFixture(fx: Fixture, seed: number): StatRow[] {
  const r = rng(seed);
  const rows: StatRow[] = [];

  for (const [club, scored] of [
    [fx.home_club_id, fx.home_score ?? 0],
    [fx.away_club_id, fx.away_score ?? 0],
  ] as [number, number][]) {
    const squad = squadOf(club);
    const gk = squad.filter((p) => p.position === "GK")[0];
    const def = squad.filter((p) => p.position === "DEF").slice(0, 4);
    const mid = squad.filter((p) => p.position === "MID").slice(0, 4);
    const fwd = squad.filter((p) => p.position === "FWD").slice(0, 2);
    const bench = [
      squad.filter((p) => p.position === "MID")[4],
      squad.filter((p) => p.position === "FWD")[2],
      squad.filter((p) => p.position === "DEF")[4],
    ];

    const starters = [gk, ...def, ...mid, ...fwd];
    starters.forEach((p) => {
      rows.push({
        player_id: p.id, fixture_id: fx.id,
        minutes: r() > 0.85 ? 60 + Math.floor(r() * 30) : 90,
        goals_scored: 0, assists: 0, own_goals: 0,
        penalties_saved: 0, penalties_missed: 0,
        yellow_cards: r() > 0.88 ? 1 : 0, red_cards: 0,
        saves: p.position === "GK" ? Math.floor(r() * 6) : 0,
      });
    });
    bench.forEach((p) => {
      rows.push({
        player_id: p.id, fixture_id: fx.id,
        minutes: r() > 0.5 ? Math.floor(r() * 30) + 1 : 0,
        goals_scored: 0, assists: 0, own_goals: 0,
        penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0,
      });
    });

    // Hand out the goals to attackers, with an assist most of the time
    const scorers = [...fwd, ...mid];
    for (let g = 0; g < scored; g++) {
      const s = scorers[Math.floor(r() * scorers.length)];
      const row = rows.find((x) => x.player_id === s.id)!;
      row.goals_scored = (row.goals_scored ?? 0) + 1;
      if (r() > 0.3) {
        const a = scorers[Math.floor(r() * scorers.length)];
        if (a.id !== s.id) {
          const ar = rows.find((x) => x.player_id === a.id)!;
          ar.assists = (ar.assists ?? 0) + 1;
        }
      }
    }
  }
  return rows;
}

const allStats: StatRow[] = fixtures.flatMap((fx, i) => statsForFixture(fx, 7000 + i * 31));

/* ------------------------------ managers ------------------------------ */

/** A legal 15 drawn from three clubs at a time, so club limits hold. */
function buildSquad(startClub: number): Pick[] {
  const pool: P[] = [];
  for (let c = 0; c < 8; c++) {
    const club = CLUBS[(startClub + c) % 24];
    pool.push(...squadOf(club));
  }
  const take = (pos: Position, n: number) => {
    const out: P[] = [];
    const perClub = new Map<number, number>();
    for (const p of pool.filter((x) => x.position === pos)) {
      const used = perClub.get(p.club_id) ?? 0;
      if (used >= RULES.maxPerClub) continue;
      out.push(p); perClub.set(p.club_id, used + 1);
      if (out.length === n) break;
    }
    return out;
  };
  const gk = take("GK", 2), def = take("DEF", 5), mid = take("MID", 5), fwd = take("FWD", 3);
  const xi = [gk[0], ...def.slice(0, 4), ...mid.slice(0, 4), ...fwd.slice(0, 2)];
  const bench = [gk[1], def[4], mid[4], fwd[2]];

  return [
    ...xi.map((p, i) => ({
      player_id: p.id, slot: i + 1,
      is_captain: i === 9, is_vice_captain: i === 5,
    })),
    ...bench.map((p, i) => ({
      player_id: p.id, slot: 12 + i, is_captain: false, is_vice_captain: false,
    })),
  ];
}

const CHIPS: (ChipName | null)[] = [null, null, "bboost", "3xc", "wildcard", null, "freehit", null];
const entries = Array.from({ length: 8 }, (_, i) => ({
  id: `manager-${i + 1}`,
  total_points: i * 3,
  free_transfers: (i % 3) + 1,
  picks: buildSquad(i * 3),
  chip: CHIPS[i],
  transfersMade: i % 4,
}));

/* ================================ tests ================================ */

describe("a full simulated gameweek", () => {
  const scored = scoreFixtures(fixtures, allStats, positionOf, clubOf);

  it("scores every performance that was entered", () => {
    expect(scored).toHaveLength(allStats.length);
    expect(scored.length).toBeGreaterThan(300);
  });

  it("derives goals conceded from the scoreline rather than trusting input", () => {
    for (const fx of fixtures) {
      const rows = scored.filter((s) => s.fixture_id === fx.id);
      for (const r of rows) {
        const isHome = clubOf.get(r.player_id) === fx.home_club_id;
        expect(r.goals_conceded).toBe(isHome ? fx.away_score : fx.home_score);
      }
    }
  });

  it("awards bonus inside each fixture, following the tie rules", () => {
    // A fixture can exceed six bonus points. Six players tied on the same BPS
    // all receive a point, which is how FPL handles ties, so the meaningful
    // checks are about tiers and ordering rather than a total.
    for (const fx of fixtures) {
      const rows = scored.filter((s) => s.fixture_id === fx.id);
      const withBonus = rows.filter((r) => r.bonus > 0);
      if (!withBonus.length) continue;

      withBonus.forEach((r) => expect([1, 2, 3]).toContain(r.bonus));

      // Never more than three distinct BPS tiers share out the bonus
      const tiers = [...new Set(withBonus.map((r) => r.bps))];
      expect(tiers.length).toBeLessThanOrEqual(3);

      // Everyone on the same BPS gets the same bonus
      tiers.forEach((t) => {
        const group = withBonus.filter((r) => r.bps === t);
        expect(new Set(group.map((g) => g.bonus)).size).toBe(1);
      });

      // Every player on the top BPS in the fixture gets the full three points
      const topBps = Math.max(...rows.map((r) => r.bps));
      rows.filter((r) => r.bps === topBps && r.bps > 0)
        .forEach((r) => expect(r.bonus).toBe(3));

      // Bonus never increases as BPS falls
      const ordered = [...withBonus].sort((a, b) => b.bps - a.bps);
      for (let i = 1; i < ordered.length; i++) {
        expect(ordered[i].bonus).toBeLessThanOrEqual(ordered[i - 1].bonus);
      }

      // Nobody outscored on BPS by a player who got nothing
      const lowestAwarded = Math.min(...withBonus.map((r) => r.bps));
      rows.filter((r) => r.bonus === 0 && r.bps > 0)
        .forEach((r) => expect(r.bps).toBeLessThan(lowestAwarded));
    }
  });

  it("gives nobody points without minutes", () => {
    scored.filter((s) => (s.minutes ?? 0) === 0).forEach((s) => {
      expect(s.total_points).toBe(0);
      expect(s.bps).toBe(0);
      expect(s.bonus).toBe(0);
    });
  });

  it("keeps clean sheets consistent with the scoreline", () => {
    for (const fx of fixtures) {
      const conceded = { home: fx.away_score ?? 0, away: fx.home_score ?? 0 };
      const rows = scored.filter((s) => s.fixture_id === fx.id);
      for (const r of rows) {
        const pos = positionOf.get(r.player_id)!;
        if (pos !== "GK" && pos !== "DEF") continue;
        const isHome = clubOf.get(r.player_id) === fx.home_club_id;
        const c = isHome ? conceded.home : conceded.away;
        if (c === 0 && (r.minutes ?? 0) >= 60) {
          // Check the clean sheet is actually in the breakdown. Asserting a
          // floor on the total would be wrong, since a booking can drag it
          // back below appearance plus clean sheet.
          const b = scorePlayerMatch(pos, r, r.bonus);
          expect(b.cleanSheet).toBe(SCORING.cleanSheet[pos]);
          expect(b.total).toBe(r.total_points);
        }
        if (c > 0 || (r.minutes ?? 0) < 60) {
          expect(scorePlayerMatch(pos, r, r.bonus).cleanSheet).toBe(0);
        }
      }
    }
  });

  it("matches goals scored to the actual scorelines", () => {
    for (const fx of fixtures) {
      const rows = scored.filter((s) => s.fixture_id === fx.id);
      const homeGoals = rows.filter((r) => clubOf.get(r.player_id) === fx.home_club_id)
        .reduce((t, r) => t + (r.goals_scored ?? 0), 0);
      expect(homeGoals).toBe(fx.home_score);
    }
  });

  /* --------------------------- season rollup --------------------------- */

  it("rolls season totals up so they reconcile with the gameweek", () => {
    const season = rollupSeason(scored);
    const seasonTotal = [...season.values()].reduce((t, s) => t + s.total_points, 0);
    const gwTotal = scored.reduce((t, s) => t + s.total_points, 0);
    expect(seasonTotal).toBe(gwTotal);

    // Bonus must reconcile exactly, not sit under some assumed cap
    const seasonBonus = [...season.values()].reduce((t, s) => t + s.bonus, 0);
    const gwBonus = scored.reduce((t, s) => t + s.bonus, 0);
    expect(seasonBonus).toBe(gwBonus);

    // And every other column should reconcile too
    const seasonGoals = [...season.values()].reduce((t, s) => t + s.goals_scored, 0);
    const actualGoals = fixtures.reduce((t, f) => t + (f.home_score ?? 0) + (f.away_score ?? 0), 0);
    expect(seasonGoals).toBe(actualGoals);

    const seasonMinutes = [...season.values()].reduce((t, s) => t + s.minutes, 0);
    expect(seasonMinutes).toBe(scored.reduce((t, s) => t + (s.minutes ?? 0), 0));
  });

  /* ------------------------------ managers ----------------------------- */

  const results = scoreEntries(entries, scored, positionOf);

  it("scores every manager", () => {
    expect(results).toHaveLength(8);
    results.forEach((r) => expect(Number.isFinite(r.points)).toBe(true));
  });

  it("never leaves a manager captainless when their captain played", () => {
    results.forEach((r) => expect(r.captainId).not.toBeNull());
  });

  it("only ever makes legal auto substitutions", () => {
    results.forEach((r, i) => {
      const picks = entries[i].picks;
      const xi = new Set(picks.filter((p) => p.slot <= 11).map((p) => p.player_id));
      r.autoSubs.forEach((s) => {
        xi.delete(s.out); xi.add(s.in);
        // A keeper can only ever be replaced by a keeper
        expect(positionOf.get(s.out) === "GK").toBe(positionOf.get(s.in) === "GK");
      });
      const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      xi.forEach((id) => counts[positionOf.get(id)!]++);
      if (entries[i].chip !== "bboost") expect(isValidFormation(counts)).toBe(true);
    });
  });

  it("applies each chip the way it should", () => {
    const bb = results.find((r) => r.chip === "bboost")!;
    expect(bb.points_on_bench).toBe(0);   // the bench counted, so nothing was left on it
    expect(bb.autoSubs).toEqual([]);      // and no subs are made

    const tc = results.find((r) => r.chip === "3xc")!;
    expect(tc.captainId).not.toBeNull();

    ["wildcard", "freehit"].forEach((c) => {
      const r = results.find((x) => x.chip === c)!;
      expect(r.transfer_cost).toBe(0);    // transfers are free
    });
  });

  it("charges transfer hits only where they are due", () => {
    results.forEach((r, i) => {
      const e = entries[i];
      if (e.chip === "wildcard" || e.chip === "freehit") { expect(r.transfer_cost).toBe(0); return; }
      const expected = Math.max(0, (e.transfersMade ?? 0) - e.free_transfers) * RULES.transferHitCost;
      expect(r.transfer_cost).toBe(expected);
    });
  });

  it("carries free transfers forward within the cap", () => {
    results.forEach((r) => {
      expect(r.free_transfers_next).toBeGreaterThanOrEqual(1);
      expect(r.free_transfers_next).toBeLessThanOrEqual(RULES.maxStoredFreeTransfers);
    });
  });

  it("adds the gameweek to each running total", () => {
    results.forEach((r, i) => expect(r.total_points).toBe(entries[i].total_points + r.points));
  });

  /* ------------------------------- tables ------------------------------ */

  it("ranks managers with no ties and no gaps", () => {
    const ranks = rankEntries(results);
    const values = [...ranks.values()].sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));
    const top = results.reduce((a, b) => (b.total_points > a.total_points ? b : a));
    expect(ranks.get(top.id)).toBe(1);
  });

  it("summarises the gameweek sensibly", () => {
    const s = summarise(results);
    const scores = results.map((r) => r.points);
    expect(s.highest_score).toBe(Math.max(...scores));
    expect(s.average_score).toBeLessThanOrEqual(s.highest_score);
    expect(s.average_score).toBeGreaterThanOrEqual(Math.min(...scores));
  });

  it("copes with a gameweek nobody has entered a team for", () => {
    expect(summarise([])).toEqual({ average_score: 0, highest_score: 0 });
    expect(rankEntries([]).size).toBe(0);
  });

  /* ------------------------------ pricing ------------------------------ */

  it("moves prices only for players with real transfer volume, and stays on grid", () => {
    const priceInputs = players.map((p, i) => ({
      player_id: p.id, now_cost: p.cost, start_cost: p.cost,
      transfers_in_gw: i % 50 === 0 ? 900 : 2,
      transfers_out_gw: i % 71 === 0 ? 900 : 1,
    }));
    const { changes } = applyPricing(priceInputs, 1000, []);
    expect(changes.length).toBeGreaterThan(0);
    changes.forEach((c) => {
      expect(Math.abs(c.delta)).toBeLessThanOrEqual(3);   // capped at 0.3m a week
      expect(c.to).toBeGreaterThanOrEqual(38);
    });
    // Starting prices stay on the 0.5m grid, in season prices need not
    players.forEach((p) => expect(isValidStartPrice(p.cost)).toBe(true));
  });

  it("recalculates selling prices, keeping only half of any rise", () => {
    const priceInputs = [
      { player_id: 1, now_cost: 60, start_cost: 60, transfers_in_gw: 900, transfers_out_gw: 0 },
    ];
    const { changes, sellingUpdates } = applyPricing(priceInputs, 1000, [
      { id: 100, player_id: 1, purchase_price: 50, selling_price: 55 },
    ]);
    const newPrice = changes[0].to;             // 60 + 3 = 63
    expect(newPrice).toBe(63);
    // Bought at 5.0, now 6.3, so keep half of 1.3 rounded down: 5.6
    expect(sellingUpdates[0].selling_price).toBe(56);
  });

  it("does not move prices before enough managers have joined", () => {
    const { changes } = applyPricing(
      [{ player_id: 1, now_cost: 60, start_cost: 60, transfers_in_gw: 900, transfers_out_gw: 0 }],
      8, []
    );
    expect(changes).toEqual([]);
  });

  /* ------------------------- running it twice -------------------------- */

  it("is idempotent, so a rerun cannot double anyone's points", () => {
    const again = scoreFixtures(fixtures, allStats, positionOf, clubOf);
    expect(again.reduce((t, s) => t + s.total_points, 0))
      .toBe(scored.reduce((t, s) => t + s.total_points, 0));

    const resultsAgain = scoreEntries(entries, again, positionOf);
    resultsAgain.forEach((r, i) => expect(r.points).toBe(results[i].points));
  });

  /* ------------------------------ sanity ------------------------------- */

  it("produces gameweek scores in a believable range", () => {
    const scores = results.map((r) => r.points);
    scores.forEach((s) => {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(200);
    });
  });
});
