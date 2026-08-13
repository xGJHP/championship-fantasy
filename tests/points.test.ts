import { describe, it, expect } from "vitest";
import { buildGameweekView, breakdownRows, StatRow } from "../lib/points";
import { Pick, Position } from "../lib/types";

const SHAPE: Position[] = [
  "GK","DEF","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD",
  "GK","DEF","MID","FWD",
];
const positions = new Map<number, Position>(SHAPE.map((p, i) => [i + 1, p]));

const picks = (capSlot = 10, viceSlot = 6): Pick[] =>
  SHAPE.map((_, i) => ({
    player_id: i + 1,
    slot: i + 1,
    is_captain: i + 1 === capSlot,
    is_vice_captain: i + 1 === viceSlot,
  }));

/**
 * Everyone plays 90 minutes and does nothing else, so 2 points each.
 * One goal conceded is deliberate: it is too few to dock a defender, since that
 * is one point per TWO conceded, but enough to deny a clean sheet. That gives a
 * clean flat baseline of 2 points for every position.
 */
const allPlayed = (overrides: Record<number, Partial<StatRow>> = {}): StatRow[] =>
  SHAPE.map((_, i) => ({
    player_id: i + 1, minutes: 90, goals_conceded: 1, ...(overrides[i + 1] ?? {}),
  }));

describe("gameweek points view", () => {
  it("scores a flat gameweek and doubles the captain", () => {
    const v = buildGameweekView({ picks: picks(), positions, stats: allPlayed() });
    // 11 starters on 2, captain gets an extra 2
    expect(v.starterPoints).toBe(24);
    expect(v.benchPoints).toBe(8);
    expect(v.total).toBe(24);
    expect(v.captainId).toBe(10);
  });

  it("triples the captain with the chip", () => {
    const v = buildGameweekView({ picks: picks(), positions, stats: allPlayed(), chip: "3xc" });
    expect(v.starterPoints).toBe(26);
    expect(v.captainMultiplier).toBe(3);
  });

  it("hands the armband to the vice when the captain blanks", () => {
    const stats = allPlayed({ 10: { minutes: 0 } });
    const v = buildGameweekView({ picks: picks(), positions, stats });
    expect(v.captainId).toBe(6);
    const vice = v.lines.find((l) => l.player_id === 6)!;
    expect(vice.multiplier).toBe(2);
  });

  it("auto-subs a blanking starter and marks both players", () => {
    const stats = allPlayed({ 7: { minutes: 0 } });
    const v = buildGameweekView({ picks: picks(), positions, stats });
    expect(v.autoSubs).toEqual([{ out: 7, in: 13 }]);
    expect(v.lines.find((l) => l.player_id === 7)!.subbedOff).toBe(true);
    expect(v.lines.find((l) => l.player_id === 13)!.subbedOn).toBe(true);
    expect(v.lines.find((l) => l.player_id === 13)!.counted).toBe(true);
    expect(v.lines.find((l) => l.player_id === 7)!.counted).toBe(false);
  });

  it("gives a benched player a multiplier of zero", () => {
    const v = buildGameweekView({ picks: picks(), positions, stats: allPlayed() });
    const benched = v.lines.find((l) => l.slot === 12)!;
    expect(benched.multiplier).toBe(0);
    expect(benched.points).toBe(0);
    expect(benched.rawPoints).toBe(2);
  });

  it("counts the whole bench with bench boost and makes no subs", () => {
    const stats = allPlayed({ 7: { minutes: 0 } });
    const v = buildGameweekView({ picks: picks(), positions, stats, chip: "bboost" });
    expect(v.autoSubs).toEqual([]);
    expect(v.benchPoints).toBe(0);
    expect(v.starters).toHaveLength(15);
  });

  it("adds up a real scoring line correctly", () => {
    // A forward: 90 mins, 2 goals, 1 assist = 2 + 8 + 3 = 13, doubled as captain
    const stats = allPlayed({ 10: { minutes: 90, goals_conceded: 1, goals_scored: 2, assists: 1 } });
    const v = buildGameweekView({ picks: picks(), positions, stats });
    const cap = v.lines.find((l) => l.player_id === 10)!;
    expect(cap.rawPoints).toBe(13);
    expect(cap.points).toBe(26);
    expect(cap.breakdown.goals).toBe(8);
    expect(cap.breakdown.assists).toBe(3);
  });

  it("handles a double gameweek by summing both matches", () => {
    const stats: StatRow[] = [
      ...allPlayed(),
      { player_id: 10, minutes: 90, goals_scored: 1, goals_conceded: 0 },
    ];
    const v = buildGameweekView({ picks: picks(), positions, stats });
    const cap = v.lines.find((l) => l.player_id === 10)!;
    expect(cap.appearances).toBe(2);
    expect(cap.minutes).toBe(180);
    // match one: 2, match two: 2 + 4 = 6, so 8 raw, doubled to 16
    expect(cap.rawPoints).toBe(8);
    expect(cap.points).toBe(16);
  });

  it("applies bonus points", () => {
    const bonus = new Map([[10, 3]]);
    const v = buildGameweekView({ picks: picks(), positions, stats: allPlayed(), bonus });
    const cap = v.lines.find((l) => l.player_id === 10)!;
    expect(cap.breakdown.bonus).toBe(3);
    expect(cap.rawPoints).toBe(5);
  });

  it("subtracts a transfer hit from the total but not from starter points", () => {
    const v = buildGameweekView({
      picks: picks(), positions, stats: allPlayed(), transfersMade: 3, freeTransfers: 1,
    });
    expect(v.transferCost).toBe(8);
    expect(v.starterPoints).toBe(24);
    expect(v.total).toBe(16);
  });

  it("charges nothing for transfers on a wildcard", () => {
    const v = buildGameweekView({
      picks: picks(), positions, stats: allPlayed(), transfersMade: 5, freeTransfers: 1, chip: "wildcard",
    });
    expect(v.transferCost).toBe(0);
  });

  it("gives zero to a player with no stats row at all", () => {
    const stats = allPlayed().filter((s) => s.player_id !== 3);
    const v = buildGameweekView({ picks: picks(), positions, stats });
    const missing = v.lines.find((l) => l.player_id === 3)!;
    expect(missing.rawPoints).toBe(0);
    expect(missing.minutes).toBe(0);
    expect(missing.appearances).toBe(0);
  });

  it("docks defenders one point per two goals conceded, and not midfielders", () => {
    const stats = allPlayed({
      2: { minutes: 90, goals_conceded: 2 },  // DEF, should drop to 1
      6: { minutes: 90, goals_conceded: 4 },  // MID, should stay on 2
      1: { minutes: 90, goals_conceded: 3 },  // GK, floor(3/2) = 1 off
    });
    const v = buildGameweekView({ picks: picks(), positions, stats });
    expect(v.lines.find((l) => l.player_id === 2)!.rawPoints).toBe(1);
    expect(v.lines.find((l) => l.player_id === 6)!.rawPoints).toBe(2);
    expect(v.lines.find((l) => l.player_id === 1)!.rawPoints).toBe(1);
  });

  it("keeps every pick in the output", () => {
    const v = buildGameweekView({ picks: picks(), positions, stats: allPlayed() });
    expect(v.lines).toHaveLength(15);
    expect(v.starters.length + v.bench.length).toBe(15);
  });
});

describe("breakdown rows", () => {
  it("lists only the things that actually scored", () => {
    const v = buildGameweekView({
      picks: picks(), positions,
      stats: allPlayed({ 2: { minutes: 90, goals_conceded: 0, goals_scored: 1 } }),
    });
    const def = v.lines.find((l) => l.player_id === 2)!;
    const rows = breakdownRows(def.breakdown);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Minutes played");
    expect(labels).toContain("Goals");
    expect(labels).toContain("Clean sheet");
    expect(labels).not.toContain("Assists");
    expect(rows.reduce((t, r) => t + r.points, 0)).toBe(def.rawPoints);
  });

  it("shows negatives too", () => {
    const v = buildGameweekView({
      picks: picks(), positions,
      stats: allPlayed({ 6: { minutes: 90, goals_conceded: 2, yellow_cards: 1, own_goals: 1 } }),
    });
    const mid = v.lines.find((l) => l.player_id === 6)!;
    const rows = breakdownRows(mid.breakdown);
    expect(rows.find((r) => r.label === "Cards")!.points).toBe(-1);
    expect(rows.find((r) => r.label === "Own goals")!.points).toBe(-2);
  });
});
