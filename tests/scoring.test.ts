import { describe, it, expect } from "vitest";
import { scorePlayerMatch, calculateBps, awardBonus, SCORING } from "../lib/scoring";
import {
  validateSquad, validateXI, applyAutoSubs, scoreEntryGameweek,
  transferCost, rolloverFreeTransfers, fmtMoney, RULES,
  validFormations, parseFormation, isValidFormation,
} from "../lib/rules";
import { sellingPrice, computePriceChanges, snapStartPrice, isValidStartPrice } from "../lib/pricing";
import { Position, Pick } from "../lib/types";

describe("player match scoring", () => {
  it("gives 2 points for a 90 minute appearance and nothing else", () => {
    expect(scorePlayerMatch("MID", { minutes: 90, goals_conceded: 2 }).total).toBe(2);
  });

  it("gives 1 point for a sub appearance under 60 minutes", () => {
    expect(scorePlayerMatch("FWD", { minutes: 25 }).total).toBe(1);
  });

  it("gives zero for an unused sub", () => {
    expect(scorePlayerMatch("FWD", { minutes: 0, goals_scored: 0 }).total).toBe(0);
  });

  it("scores a defender: 90 mins, goal, clean sheet = 2 + 6 + 4 = 12", () => {
    const s = scorePlayerMatch("DEF", { minutes: 90, goals_scored: 1, goals_conceded: 0 });
    expect(s.total).toBe(12);
  });

  it("scores a forward hat-trick with an assist: 2 + 12 + 3 = 17", () => {
    const s = scorePlayerMatch("FWD", { minutes: 90, goals_scored: 3, assists: 1 });
    expect(s.total).toBe(17);
  });

  it("denies a clean sheet to a player subbed off before 60 minutes", () => {
    const s = scorePlayerMatch("DEF", { minutes: 45, goals_conceded: 0 });
    expect(s.cleanSheet).toBe(0);
    expect(s.total).toBe(1);
  });

  it("keeps a clean sheet for a midfielder at 1 point", () => {
    expect(scorePlayerMatch("MID", { minutes: 90, goals_conceded: 0 }).total).toBe(3);
  });

  it("docks a keeper 1 point per 2 conceded and pays 1 per 3 saves", () => {
    // 90 mins (2) + 6 saves (2) - 3 conceded -> floor(3/2) = 1 (-1) = 3
    const s = scorePlayerMatch("GK", { minutes: 90, saves: 6, goals_conceded: 3 });
    expect(s.saves).toBe(2);
    expect(s.goalsConceded).toBe(-1);
    expect(s.total).toBe(3);
  });

  it("does not dock midfielders for goals conceded", () => {
    expect(scorePlayerMatch("MID", { minutes: 90, goals_conceded: 5 }).goalsConceded).toBe(0);
  });

  it("handles a red card, own goal and missed penalty", () => {
    // 2 - 3 (red) - 2 (og) - 2 (pen miss) = -5
    const s = scorePlayerMatch("MID", {
      minutes: 70, red_cards: 1, own_goals: 1, penalties_missed: 1, goals_conceded: 1,
    });
    expect(s.total).toBe(-5);
  });

  it("pays 5 for a saved penalty", () => {
    const s = scorePlayerMatch("GK", { minutes: 90, penalties_saved: 1, goals_conceded: 0, saves: 3 });
    // 2 + 4 (CS) + 1 (saves) + 5 = 12
    expect(s.total).toBe(12);
  });

  it("adds bonus on top", () => {
    expect(scorePlayerMatch("FWD", { minutes: 90, goals_scored: 1 }, 3).total).toBe(9);
  });

  it("leaves defensive contribution off by default", () => {
    const s = scorePlayerMatch("DEF", {
      minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: 14, tackles: 4,
    });
    expect(s.defensiveContribution).toBe(0);
  });

  it("awards defensive contribution when enabled", () => {
    SCORING.defensiveContribution.enabled = true;
    const s = scorePlayerMatch("DEF", {
      minutes: 90, goals_conceded: 1, clearances_blocks_interceptions: 8, tackles: 3,
    });
    expect(s.defensiveContribution).toBe(2);
    SCORING.defensiveContribution.enabled = false;
  });
});

describe("bps and bonus", () => {
  it("returns 0 bps for a player who did not appear", () => {
    expect(calculateBps("MID", { minutes: 0, goals_scored: 2 })).toBe(0);
  });

  it("builds bps from minutes, goal and clean sheet", () => {
    // 6 (60+) + 12 (DEF goal) + 12 (CS) = 30
    expect(calculateBps("DEF", { minutes: 90, goals_scored: 1, goals_conceded: 0 })).toBe(30);
  });

  it("awards 3/2/1 to the top three", () => {
    const b = awardBonus([
      { player_id: 1, bps: 40 },
      { player_id: 2, bps: 33 },
      { player_id: 3, bps: 28 },
      { player_id: 4, bps: 20 },
    ]);
    expect(b.get(1)).toBe(3);
    expect(b.get(2)).toBe(2);
    expect(b.get(3)).toBe(1);
    expect(b.get(4)).toBeUndefined();
  });

  it("gives two players 3 each when tied on top, then 1 to third", () => {
    const b = awardBonus([
      { player_id: 1, bps: 40 },
      { player_id: 2, bps: 40 },
      { player_id: 3, bps: 30 },
      { player_id: 4, bps: 10 },
    ]);
    expect(b.get(1)).toBe(3);
    expect(b.get(2)).toBe(3);
    expect(b.get(3)).toBe(1);
    expect(b.get(4)).toBeUndefined();
  });

  it("gives two players 2 each when tied for second and no 1 is awarded", () => {
    const b = awardBonus([
      { player_id: 1, bps: 50 },
      { player_id: 2, bps: 30 },
      { player_id: 3, bps: 30 },
      { player_id: 4, bps: 10 },
    ]);
    expect(b.get(1)).toBe(3);
    expect(b.get(2)).toBe(2);
    expect(b.get(3)).toBe(2);
    expect(b.get(4)).toBeUndefined();
  });

  it("ignores players on negative or zero bps", () => {
    const b = awardBonus([{ player_id: 1, bps: 0 }, { player_id: 2, bps: -5 }]);
    expect(b.size).toBe(0);
  });
});

/* ---------------------------------------------------------------- */

const mkSquad = (over: Partial<Record<Position, number>> = {}, cost = 66) => {
  const quota = { ...RULES.squadQuota, ...over };
  const out: { id: number; position: Position; club_id: number; cost: number }[] = [];
  let id = 1;
  (["GK", "DEF", "MID", "FWD"] as Position[]).forEach((pos) => {
    for (let i = 0; i < quota[pos]; i++) {
      out.push({ id: id, position: pos, club_id: id % 8, cost });
      id++;
    }
  });
  return out;
};

describe("squad validation", () => {
  it("accepts a legal squad", () => {
    expect(validateSquad(mkSquad())).toEqual([]);
  });

  it("rejects the wrong number of defenders", () => {
    const v = validateSquad(mkSquad({ DEF: 4 }));
    expect(v.some((x) => x.code === "QUOTA_DEF")).toBe(true);
  });

  it("rejects going over budget", () => {
    const v = validateSquad(mkSquad({}, 80)); // 15 x 8.0m = 120.0m
    expect(v.some((x) => x.code === "BUDGET")).toBe(true);
  });

  it("rejects more than three players from one club", () => {
    const squad = mkSquad().map((p) => ({ ...p, club_id: 1 }));
    const v = validateSquad(squad);
    expect(v.some((x) => x.code === "CLUB_LIMIT")).toBe(true);
  });

  it("rejects duplicate players", () => {
    const squad = mkSquad();
    squad[1] = { ...squad[0] };
    expect(validateSquad(squad).some((x) => x.code === "DUPLICATE")).toBe(true);
  });

  it("rejects an XI with two keepers", () => {
    const xi = [
      ...Array(2).fill(0).map((_, i) => ({ id: i, position: "GK" as Position, club_id: i, cost: 45 })),
      ...Array(4).fill(0).map((_, i) => ({ id: 10 + i, position: "DEF" as Position, club_id: i, cost: 45 })),
      ...Array(4).fill(0).map((_, i) => ({ id: 20 + i, position: "MID" as Position, club_id: i, cost: 45 })),
      ...Array(1).fill(0).map((_, i) => ({ id: 30 + i, position: "FWD" as Position, club_id: i, cost: 45 })),
    ];
    expect(validateXI(xi).some((x) => x.code === "XI_MAX_GK")).toBe(true);
  });

  it("rejects an XI with only two defenders", () => {
    const xi = [
      { id: 1, position: "GK" as Position, club_id: 1, cost: 45 },
      ...Array(2).fill(0).map((_, i) => ({ id: 10 + i, position: "DEF" as Position, club_id: i, cost: 45 })),
      ...Array(5).fill(0).map((_, i) => ({ id: 20 + i, position: "MID" as Position, club_id: i, cost: 45 })),
      ...Array(3).fill(0).map((_, i) => ({ id: 30 + i, position: "FWD" as Position, club_id: i, cost: 45 })),
    ];
    expect(validateXI(xi).some((x) => x.code === "XI_MIN_DEF")).toBe(true);
  });
});

/* ---------------------------------------------------------------- */

// 1 GK, 4 DEF, 4 MID, 2 FWD starting; bench = GK, DEF, MID, FWD
const POS: Position[] = [
  "GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD",
  "GK", "DEF", "MID", "FWD",
];
const basePicks = (): Pick[] =>
  POS.map((_, i) => ({
    player_id: i + 1,
    slot: i + 1,
    is_captain: i === 9,        // player 10, a forward
    is_vice_captain: i === 5,   // player 6, a midfielder
  }));
const posMap = new Map<number, Position>(POS.map((p, i) => [i + 1, p]));

describe("auto substitutions", () => {
  it("subs a blanking outfielder for the first bench player who played", () => {
    const minutes = new Map<number, number>();
    POS.forEach((_, i) => minutes.set(i + 1, 90));
    minutes.set(7, 0);   // MID starter blanks
    minutes.set(13, 90); // bench DEF played
    const subs = applyAutoSubs({ picks: basePicks(), position: posMap, minutes });
    expect(subs).toEqual([{ out: 7, in: 13 }]);
  });

  it("only ever swaps a keeper for the bench keeper", () => {
    const minutes = new Map<number, number>();
    POS.forEach((_, i) => minutes.set(i + 1, 90));
    minutes.set(1, 0);  // starting GK blanks
    const subs = applyAutoSubs({ picks: basePicks(), position: posMap, minutes });
    expect(subs).toEqual([{ out: 1, in: 12 }]);
  });

  it("refuses a sub that would break the minimum defender rule", () => {
    // Start 3 at the back by benching a DEF: make slot 5 a MID instead
    const pos2 = new Map(posMap);
    pos2.set(5, "MID");
    const minutes = new Map<number, number>();
    POS.forEach((_, i) => minutes.set(i + 1, 90));
    minutes.set(2, 0);   // a DEF starter blanks, leaving 2 DEF
    minutes.set(13, 0);  // bench DEF did not play
    minutes.set(14, 90); // bench MID did
    const subs = applyAutoSubs({ picks: basePicks(), position: pos2, minutes });
    expect(subs).toEqual([]); // bringing on a MID would leave only 2 DEF
  });

  it("makes no sub when the bench also blanked", () => {
    const minutes = new Map<number, number>();
    POS.forEach((_, i) => minutes.set(i + 1, 90));
    minutes.set(7, 0);
    [12, 13, 14, 15].forEach((i) => minutes.set(i, 0));
    expect(applyAutoSubs({ picks: basePicks(), position: posMap, minutes })).toEqual([]);
  });
});

describe("entry gameweek scoring", () => {
  const allPlayed = () => {
    const m = new Map<number, number>();
    POS.forEach((_, i) => m.set(i + 1, 90));
    return m;
  };
  const flatPoints = (n = 2) => {
    const p = new Map<number, number>();
    POS.forEach((_, i) => p.set(i + 1, n));
    return p;
  };

  it("doubles the captain", () => {
    const r = scoreEntryGameweek({
      picks: basePicks(), position: posMap, minutes: allPlayed(), points: flatPoints(2),
    });
    expect(r.starterPoints).toBe(11 * 2 + 2); // 11 starters on 2, captain doubled
    expect(r.benchPoints).toBe(8);
  });

  it("triples the captain with the 3xc chip", () => {
    const r = scoreEntryGameweek({
      picks: basePicks(), position: posMap, minutes: allPlayed(), points: flatPoints(2), chip: "3xc",
    });
    expect(r.starterPoints).toBe(11 * 2 + 4);
  });

  it("promotes the vice captain when the captain does not play", () => {
    const minutes = allPlayed();
    minutes.set(10, 0); // captain blanks
    const points = flatPoints(2);
    points.set(10, 0);
    const r = scoreEntryGameweek({ picks: basePicks(), position: posMap, minutes, points });
    expect(r.captainId).toBe(6);
  });

  it("counts the bench with bench boost and makes no auto subs", () => {
    const minutes = allPlayed();
    minutes.set(7, 0);
    const r = scoreEntryGameweek({
      picks: basePicks(), position: posMap, minutes, points: flatPoints(2), chip: "bboost",
    });
    expect(r.autoSubs).toEqual([]);
    expect(r.benchPoints).toBe(0);
    expect(r.starterPoints).toBe(15 * 2 + 2);
  });

  it("subtracts transfer hits from the total", () => {
    const r = scoreEntryGameweek({
      picks: basePicks(), position: posMap, minutes: allPlayed(), points: flatPoints(2),
      transfersMade: 3, freeTransfers: 1,
    });
    expect(r.transferHit).toBe(8);
    expect(r.total).toBe(r.starterPoints - 8);
  });
});

describe("transfers", () => {
  it("charges 4 points per transfer beyond the free ones", () => {
    expect(transferCost({ transfersMade: 1, freeTransfers: 1 })).toBe(0);
    expect(transferCost({ transfersMade: 3, freeTransfers: 1 })).toBe(8);
  });

  it("charges nothing on a wildcard or free hit", () => {
    expect(transferCost({ transfersMade: 9, freeTransfers: 1, chip: "wildcard" })).toBe(0);
    expect(transferCost({ transfersMade: 9, freeTransfers: 1, chip: "freehit" })).toBe(0);
  });

  it("rolls over unused free transfers and caps them at five", () => {
    expect(rolloverFreeTransfers(1, 0)).toBe(2);
    expect(rolloverFreeTransfers(2, 2)).toBe(1);
    expect(rolloverFreeTransfers(5, 0)).toBe(5);
  });
});

describe("pricing", () => {
  it("snaps a STARTING price to the nearest 0.5m", () => {
    expect(snapStartPrice(53)).toBe(55);
    expect(snapStartPrice(52)).toBe(50);
    expect(isValidStartPrice(55)).toBe(true);
    expect(isValidStartPrice(58)).toBe(false);
  });

  it("lets in-season prices drift in 0.1m steps off the 0.5m grid", () => {
    const changes = computePriceChanges(
      [{ player_id: 1, now_cost: 60, start_cost: 60, transfers_in_gw: 130, transfers_out_gw: 0 }],
      1000
    );
    expect(changes[0].to).toBe(62);            // 6.2m is a legal in-season price
    expect(isValidStartPrice(changes[0].to)).toBe(false);
  });

  it("gives back only half of a rise, rounded down to 0.1m", () => {
    expect(sellingPrice(50, 53)).toBe(51); // +0.3 rise -> keep 0.1
    expect(sellingPrice(50, 54)).toBe(52); // +0.4 rise -> keep 0.2
    expect(sellingPrice(50, 55)).toBe(52); // +0.5 rise -> keep 0.2
    expect(sellingPrice(50, 50)).toBe(50);
  });

  it("absorbs the full fall when a player drops", () => {
    expect(sellingPrice(50, 47)).toBe(47);
  });

  it("does not move prices below the minimum manager count", () => {
    const changes = computePriceChanges(
      [{ player_id: 1, now_cost: 50, start_cost: 50, transfers_in_gw: 100, transfers_out_gw: 0 }],
      10
    );
    expect(changes).toEqual([]);
  });

  it("raises a heavily bought player", () => {
    const changes = computePriceChanges(
      [{ player_id: 1, now_cost: 50, start_cost: 50, transfers_in_gw: 80, transfers_out_gw: 0 }],
      1000
    );
    expect(changes[0].delta).toBe(1);
  });

  it("caps movement at 0.3m in a single gameweek", () => {
    const changes = computePriceChanges(
      [{ player_id: 1, now_cost: 50, start_cost: 50, transfers_in_gw: 900, transfers_out_gw: 0 }],
      1000
    );
    expect(changes[0].delta).toBe(3);
  });

  it("drops a heavily sold player", () => {
    const changes = computePriceChanges(
      [{ player_id: 1, now_cost: 50, start_cost: 50, transfers_in_gw: 0, transfers_out_gw: 200 }],
      1000
    );
    expect(changes[0].delta).toBeLessThan(0);
  });
});

describe("formatting", () => {
  it("formats tenths of a million as pounds", () => {
    expect(fmtMoney(55)).toBe("£5.5m");
    expect(fmtMoney(1000)).toBe("£100.0m");
    expect(fmtMoney(-5)).toBe("-£0.5m");
  });
});

describe("formations", () => {
  it("lists exactly the eight legal shapes", () => {
    const list = validFormations().map((f) => `${f.DEF}-${f.MID}-${f.FWD}`);
    expect(list.sort()).toEqual([
      "3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-2-3", "5-3-2", "5-4-1",
    ]);
  });

  it("every listed formation adds up to eleven and validates", () => {
    for (const f of validFormations()) {
      expect(1 + f.DEF + f.MID + f.FWD).toBe(11);
      expect(isValidFormation({ GK: 1, ...f })).toBe(true);
    }
  });

  it("parses a formation string and rejects illegal ones", () => {
    expect(parseFormation("3-5-2")).toEqual({ DEF: 3, MID: 5, FWD: 2 });
    expect(parseFormation("2-5-3")).toBeNull();   // too few defenders
    expect(parseFormation("4-4-3")).toBeNull();   // twelve players
    expect(parseFormation("3-3-5")).toBeNull();   // too many forwards
    expect(parseFormation("nonsense")).toBeNull();
  });
});
