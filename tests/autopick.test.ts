import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { autoPickSquad, PickablePlayer, AutoPickOutcome } from "../lib/autopick";
import { RULES, validateSquad, validateXI, isValidFormation } from "../lib/rules";
import { Position } from "../lib/types";

/** The real 484 player list, exactly as it reaches the browser. */
function realPlayers(withPoints = false): PickablePlayer[] {
  const rows = readFileSync("data/players_full.csv", "utf8").trim().split("\n").slice(1);
  return rows.map((l, i) => {
    const c = l.split(",");
    return {
      id: i + 1,
      club_id: Number(c[1]),
      position: c[3] as Position,
      now_cost: Number(c[5]),
      total_points: withPoints ? (i * 7) % 120 : 0,
      status: "a",
    };
  });
}

const check = (r: AutoPickOutcome) => {
  if (!r.ok) throw new Error(`expected a squad, got: ${r.reason}`);
  expect(r.squad).toHaveLength(RULES.squadSize);
  const errs = validateSquad(
    r.squad.map((p) => ({ id: p.id, position: p.position, club_id: p.club_id, cost: p.now_cost }))
  );
  expect(errs).toEqual([]);
  expect(r.spend).toBeLessThanOrEqual(RULES.budget);
  return r;
};

describe("auto pick, before a ball is kicked", () => {
  const players = realPlayers(false);

  it("fills all fifteen, which the old version did not", () => {
    const res = check(autoPickSquad(players));
    expect(res.squad).toHaveLength(15);
  });

  it("meets every squad rule", () => {
    const res = check(autoPickSquad(players));
    (["GK", "DEF", "MID", "FWD"] as Position[]).forEach((pos) =>
      expect(res.squad.filter((p) => p.position === pos)).toHaveLength(RULES.squadQuota[pos])
    );
    const byClub = new Map<number, number>();
    res.squad.forEach((p) => byClub.set(p.club_id, (byClub.get(p.club_id) ?? 0) + 1));
    [...byClub.values()].forEach((n) => expect(n).toBeLessThanOrEqual(RULES.maxPerClub));
    expect(new Set(res.squad.map((p) => p.id)).size).toBe(15);
  });

  it("returns a legal starting eleven", () => {
    const res = check(autoPickSquad(players));
    expect(res.xi).toHaveLength(RULES.xiSize);
    const xi = res.squad.filter((p) => res.xi.includes(p.id));
    expect(validateXI(xi.map((p) => ({ id: p.id, position: p.position, club_id: p.club_id, cost: p.now_cost })))).toEqual([]);
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    xi.forEach((p) => counts[p.position]++);
    expect(isValidFormation(counts)).toBe(true);
  });

  it("names a captain and a vice, both of whom start", () => {
    const res = check(autoPickSquad(players));
    expect(res.captainId).not.toBeNull();
    expect(res.viceId).not.toBeNull();
    expect(res.captainId).not.toBe(res.viceId);
    expect(res.xi).toContain(res.captainId!);
    expect(res.xi).toContain(res.viceId!);
  });

  it("spends most of the budget rather than stranding it", () => {
    const res = check(autoPickSquad(players));
    // The old version left 30.5m unspent with eight slots unfilled
    expect(res.spend).toBeGreaterThan(RULES.budget * 0.9);
    expect(res.bank).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic, so two clicks give the same team", () => {
    const a = check(autoPickSquad(players));
    const b = check(autoPickSquad(players));
    expect(a.squad.map((p) => p.id).sort()).toEqual(b.squad.map((p) => p.id).sort());
  });
});

describe("auto pick, once points exist", () => {
  const players = realPlayers(true);

  it("still produces a legal squad", () => {
    const res = check(autoPickSquad(players));
    expect(res.squad).toHaveLength(15);
  });

  it("switches to picking on points rather than price", () => {
    const res = check(autoPickSquad(players));
    const avgPicked = res.squad.reduce((t, p) => t + p.total_points, 0) / 15;
    const avgAll = players.reduce((t, p) => t + p.total_points, 0) / players.length;
    expect(avgPicked).toBeGreaterThan(avgAll);
  });

  it("captains the highest scorer in the eleven", () => {
    const res = check(autoPickSquad(players));
    const xi = res.squad.filter((p) => res.xi.includes(p.id));
    const top = Math.max(...xi.map((p) => p.total_points));
    expect(xi.find((p) => p.id === res.captainId)!.total_points).toBe(top);
  });
});

describe("auto pick, awkward pools", () => {
  // A shared counter, because deriving ids from position and cost collides
  let nextId = 1;
  const mk = (n: number, pos: Position, cost: number, club: (i: number) => number): PickablePlayer[] =>
    Array.from({ length: n }, (_, i) => ({
      id: nextId++,
      club_id: club(i), position: pos, now_cost: cost, total_points: 0, status: "a",
    }));

  const minimal = () => [
    ...mk(2, "GK", 40, (i) => i + 1),
    ...mk(5, "DEF", 40, (i) => i + 3),
    ...mk(5, "MID", 45, (i) => i + 9),
    ...mk(3, "FWD", 45, (i) => i + 15),
  ];

  it("gives every fabricated player a unique id, or the test proves nothing", () => {
    const pool = minimal();
    expect(new Set(pool.map((p) => p.id)).size).toBe(pool.length);
  });

  it("handles a pool with exactly enough players", () => {
    const res = check(autoPickSquad(minimal()));
    expect(res.squad).toHaveLength(15);
  });

  it("returns null rather than a broken squad when the pool is too thin", () => {
    expect(autoPickSquad(mk(3, "GK", 40, (i) => i + 1)).ok).toBe(false);
    expect(autoPickSquad([]).ok).toBe(false);
  });

  it("returns null when the cheapest possible squad busts the budget", () => {
    const dear = [
      ...mk(2, "GK", 150, (i) => i + 1),
      ...mk(5, "DEF", 150, (i) => i + 3),
      ...mk(5, "MID", 150, (i) => i + 9),
      ...mk(3, "FWD", 150, (i) => i + 15),
    ];
    expect(autoPickSquad(dear).ok).toBe(false);
  });

  it("respects the three per club cap even when a club is the cheapest option", () => {
    const oneClub: PickablePlayer[] = [
      ...mk(2, "GK", 40, () => 1),
      ...mk(5, "DEF", 40, () => 1),
      ...mk(5, "MID", 40, () => 1),
      ...mk(3, "FWD", 40, () => 1),
      ...mk(2, "GK", 45, (i) => i + 2),
      ...mk(5, "DEF", 45, (i) => i + 4),
      ...mk(5, "MID", 45, (i) => i + 10),
      ...mk(3, "FWD", 45, (i) => i + 16),
    ];
    const res = autoPickSquad(oneClub);
    if (res.ok) {
      const fromClub1 = res.squad.filter((p) => p.club_id === 1).length;
      expect(fromClub1).toBeLessThanOrEqual(RULES.maxPerClub);
    }
  });

  it("skips injured and unavailable players when it can", () => {
    const players = realPlayers(false).map((p, i) => ({ ...p, status: i % 2 === 0 ? "i" : "a" }));
    const res = check(autoPickSquad(players));
    res.squad.forEach((p) => expect(p.status).toBe("a"));
  });

  it("falls back to the full pool if almost everyone is flagged", () => {
    const players = realPlayers(false).map((p) => ({ ...p, status: "i" }));
    const res = check(autoPickSquad(players));
    expect(res.squad).toHaveLength(15);
  });
});

describe("completing a squad someone has already started", () => {
  const players = realPlayers(false);
  const byName = (n: string) => {
    const rows = readFileSync("data/players_full.csv", "utf8").trim().split("\n").slice(1);
    const i = rows.findIndex((l) => l.split(",")[2] === n);
    return players[i];
  };

  it("keeps every player they chose and fills the rest", () => {
    const chosen = [
      byName("Jarrod Bowen"), byName("Zan Vipotnik"), byName("Sorba Thomas"),
      byName("Josh Tymon"), byName("Michael Cooper"), byName("Tommy Conway"),
    ];
    const res = check(autoPickSquad(players, { keep: chosen.map((p) => p.id) }));

    chosen.forEach((p) => expect(res.squad.map((s) => s.id)).toContain(p.id));
    expect(res.kept.sort()).toEqual(chosen.map((p) => p.id).sort());
    expect(res.added).toHaveLength(RULES.squadSize - chosen.length);
    expect(res.squad).toHaveLength(RULES.squadSize);
  });

  it("never changes a player they chose, even an expensive one", () => {
    const bowen = byName("Jarrod Bowen");
    const res = check(autoPickSquad(players, { keep: [bowen.id] }));
    expect(res.squad.find((p) => p.id === bowen.id)).toBeTruthy();
    expect(res.added).not.toContain(bowen.id);
  });

  it("stays inside the budget after filling around expensive picks", () => {
    const dear = [
      byName("Jarrod Bowen"), byName("Taty Castellanos"),
      byName("Raul Jimenez"), byName("Zan Vipotnik"),
    ];
    const res = check(autoPickSquad(players, { keep: dear.map((p) => p.id) }));
    expect(res.spend).toBeLessThanOrEqual(RULES.budget);
    expect(res.bank).toBeGreaterThanOrEqual(0);
  });

  it("respects the club limit set by their picks", () => {
    const westHam = players.filter((p) => p.club_id === byName("Jarrod Bowen").club_id).slice(0, 3);
    const res = check(autoPickSquad(players, { keep: westHam.map((p) => p.id) }));
    const fromThatClub = res.squad.filter((p) => p.club_id === westHam[0].club_id).length;
    expect(fromThatClub).toBe(RULES.maxPerClub);
  });

  it("does not exceed a position quota they have already filled", () => {
    const keepers = players.filter((p) => p.position === "GK").slice(0, 2);
    const res = check(autoPickSquad(players, { keep: keepers.map((p) => p.id) }));
    expect(res.squad.filter((p) => p.position === "GK")).toHaveLength(2);
    keepers.forEach((k) => expect(res.squad.map((p) => p.id)).toContain(k.id));
  });

  it("returns the squad untouched when all fifteen are already picked", () => {
    const full = check(autoPickSquad(players));
    const again = check(autoPickSquad(players, { keep: full.squad.map((p) => p.id) }));
    expect(again.squad.map((p) => p.id).sort()).toEqual(full.squad.map((p) => p.id).sort());
    expect(again.added).toHaveLength(0);
  });

  it("explains itself when their picks are too expensive to build around", () => {
    // Ten of the priciest players leaves nothing for the other five
    const priciest = [...players].sort((a, b) => b.now_cost - a.now_cost);
    const keep: PickablePlayer[] = [];
    const byClub = new Map<number, number>();
    const byPos: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const p of priciest) {
      if (keep.length === 10) break;
      if ((byClub.get(p.club_id) ?? 0) >= RULES.maxPerClub) continue;
      if (byPos[p.position] >= RULES.squadQuota[p.position]) continue;
      keep.push(p);
      byClub.set(p.club_id, (byClub.get(p.club_id) ?? 0) + 1);
      byPos[p.position]++;
    }
    const res = autoPickSquad(players, { keep: keep.map((p) => p.id) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toMatch(/over|expensive|sell/i);
      expect(res.reason).not.toMatch(/undefined|NaN/);
    }
  });

  it("rejects a starting point that already breaks a rule", () => {
    const fourKeepers = players.filter((p) => p.position === "GK").slice(0, 3);
    const bad = autoPickSquad(players, { keep: fourKeepers.map((p) => p.id) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/GK/);
  });

  it("ignores a duplicate id in the keep list", () => {
    const bowen = byName("Jarrod Bowen");
    const res = check(autoPickSquad(players, { keep: [bowen.id, bowen.id, bowen.id] }));
    expect(res.squad.filter((p) => p.id === bowen.id)).toHaveLength(1);
    expect(res.squad).toHaveLength(15);
  });

  it("still returns a legal eleven around their picks", () => {
    const chosen = [byName("Jarrod Bowen"), byName("Zan Vipotnik"), byName("Josh Tymon")];
    const res = check(autoPickSquad(players, { keep: chosen.map((p) => p.id) }));
    expect(res.xi).toHaveLength(RULES.xiSize);
    const xi = res.squad.filter((p) => res.xi.includes(p.id));
    const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    xi.forEach((p) => counts[p.position]++);
    expect(isValidFormation(counts)).toBe(true);
  });
});
