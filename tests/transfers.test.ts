import { describe, it, expect } from "vitest";
import { validateTransfers, blockedReason, SquadSlot, MarketPlayer } from "../lib/transfers";
import { Position } from "../lib/types";

const SHAPE: Position[] = [
  "GK","DEF","DEF","DEF","DEF","MID","MID","MID","MID","FWD","FWD",
  "GK","DEF","MID","FWD",
];

/** 15 players, ids 1-15, clubs spread so nobody is near the 3 per club limit */
const squad = (): SquadSlot[] =>
  SHAPE.map((position, i) => ({
    player_id: i + 1,
    position,
    club_id: (i % 8) + 1,
    purchase_price: 50,
    selling_price: 50,
    slot: i + 1,
  }));

const market = (extra: Partial<MarketPlayer>[] = []) => {
  const m = new Map<number, MarketPlayer>();
  // ids 101-104: one of each position at 5.0m, club 20
  ([["GK",101],["DEF",102],["MID",103],["FWD",104]] as [Position, number][])
    .forEach(([position, id]) => m.set(id, { id, position, club_id: 20, now_cost: 50 }));
  extra.forEach((p) => m.set(p.id!, { club_id: 20, now_cost: 50, position: "MID", ...p } as MarketPlayer));
  return m;
};

const base = { squad: squad(), market: market(), bank: 0, freeTransfers: 1 };

describe("transfer validation", () => {
  it("accepts a straight like for like swap inside budget", () => {
    const r = validateTransfers({ ...base, transfers: [{ out_id: 6, in_id: 103 }] });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.pointsCost).toBe(0);
    expect(r.bankAfter).toBe(0);
  });

  it("refuses to swap a midfielder for a forward", () => {
    const r = validateTransfers({ ...base, transfers: [{ out_id: 6, in_id: 104 }] });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/like for like/i);
  });

  it("refuses a player you already own", () => {
    const m = market([{ id: 200, position: "MID", club_id: 1, now_cost: 50 }]);
    const sq = squad();
    sq[5] = { ...sq[5], player_id: 200 };
    const r = validateTransfers({ ...base, squad: sq, market: m, transfers: [{ out_id: 7, in_id: 200 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/already own/i);
  });

  it("blocks a transfer you cannot afford and says by how much", () => {
    const m = market([{ id: 300, position: "MID", club_id: 20, now_cost: 95 }]);
    const r = validateTransfers({ ...base, market: m, bank: 0, transfers: [{ out_id: 6, in_id: 300 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("£4.5m short");
  });

  it("allows it once the bank covers the gap", () => {
    const m = market([{ id: 300, position: "MID", club_id: 20, now_cost: 95 }]);
    const r = validateTransfers({ ...base, market: m, bank: 45, transfers: [{ out_id: 6, in_id: 300 }] });
    expect(r.ok).toBe(true);
    expect(r.bankAfter).toBe(0);
  });

  it("spends the selling price, not the current price", () => {
    // Bought at 5.0m, now worth 6.0m, but only sells for 5.5m
    const sq = squad();
    sq[5] = { ...sq[5], purchase_price: 50, selling_price: 55 };
    const m = market([{ id: 300, position: "MID", club_id: 20, now_cost: 60 }]);
    const r = validateTransfers({ ...base, squad: sq, market: m, bank: 0, transfers: [{ out_id: 6, in_id: 300 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("£0.5m short");
  });

  it("stops you exceeding three from one club", () => {
    const sq = squad();
    // Three midfielders already at club 20
    sq[5] = { ...sq[5], club_id: 20 };
    sq[6] = { ...sq[6], club_id: 20 };
    sq[7] = { ...sq[7], club_id: 20 };
    const r = validateTransfers({ ...base, squad: sq, transfers: [{ out_id: 9, in_id: 103 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/more than 3 players from one club/i);
  });

  it("allows a fourth from a club if one of them is the player leaving", () => {
    const sq = squad();
    sq[5] = { ...sq[5], club_id: 20 };
    sq[6] = { ...sq[6], club_id: 20 };
    sq[7] = { ...sq[7], club_id: 20 };
    const r = validateTransfers({ ...base, squad: sq, transfers: [{ out_id: 6, in_id: 103 }] });
    expect(r.ok).toBe(true);
  });

  it("charges 4 points for a second transfer on one free transfer", () => {
    const m = market([{ id: 301, position: "DEF", club_id: 20, now_cost: 50 }]);
    const r = validateTransfers({
      ...base, market: m, freeTransfers: 1,
      transfers: [{ out_id: 6, in_id: 103 }, { out_id: 2, in_id: 301 }],
    });
    expect(r.ok).toBe(true);
    expect(r.transfersMade).toBe(2);
    expect(r.pointsCost).toBe(4);
    expect(r.freeUsed).toBe(1);
  });

  it("charges nothing when free transfers cover it", () => {
    const m = market([{ id: 301, position: "DEF", club_id: 20, now_cost: 50 }]);
    const r = validateTransfers({
      ...base, market: m, freeTransfers: 2,
      transfers: [{ out_id: 6, in_id: 103 }, { out_id: 2, in_id: 301 }],
    });
    expect(r.pointsCost).toBe(0);
    expect(r.freeUsed).toBe(2);
  });

  it("makes everything free on a wildcard", () => {
    const m = market([
      { id: 301, position: "DEF", club_id: 20, now_cost: 50 },
      { id: 302, position: "FWD", club_id: 21, now_cost: 50 },
    ]);
    const r = validateTransfers({
      ...base, market: m, freeTransfers: 1, chip: "wildcard",
      transfers: [{ out_id: 6, in_id: 103 }, { out_id: 2, in_id: 301 }, { out_id: 10, in_id: 302 }],
    });
    expect(r.ok).toBe(true);
    expect(r.pointsCost).toBe(0);
    expect(r.freeUsed).toBe(0);
  });

  it("still enforces the budget on a wildcard", () => {
    const m = market([{ id: 300, position: "MID", club_id: 20, now_cost: 99 }]);
    const r = validateTransfers({
      ...base, market: m, bank: 0, chip: "wildcard",
      transfers: [{ out_id: 6, in_id: 300 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/short/);
  });

  it("rejects selling the same player twice", () => {
    const m = market([{ id: 301, position: "MID", club_id: 21, now_cost: 50 }]);
    const r = validateTransfers({
      ...base, market: m,
      transfers: [{ out_id: 6, in_id: 103 }, { out_id: 6, in_id: 301 }],
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/same player twice/i);
  });

  it("rejects a player who is not in your squad", () => {
    const r = validateTransfers({ ...base, transfers: [{ out_id: 999, in_id: 103 }] });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not in your squad/i);
  });

  it("returns the squad as it would look afterwards", () => {
    const r = validateTransfers({ ...base, transfers: [{ out_id: 6, in_id: 103 }] });
    expect(r.resultingSquad).toHaveLength(15);
    expect(r.resultingSquad.some((s) => s.player_id === 6)).toBe(false);
    expect(r.resultingSquad.some((s) => s.player_id === 103)).toBe(true);
    // A newly bought player sells for what you paid
    const bought = r.resultingSquad.find((s) => s.player_id === 103)!;
    expect(bought.selling_price).toBe(bought.purchase_price);
  });
});

describe("blockedReason", () => {
  const sq = squad();
  const out = sq[5]; // a MID

  it("tells you to pick someone to sell first", () => {
    expect(blockedReason({ id: 103, position: "MID", club_id: 20, now_cost: 50 }, null, sq, 0))
      .toBe("Pick someone to sell first");
  });

  it("names the position you need", () => {
    expect(blockedReason({ id: 104, position: "FWD", club_id: 20, now_cost: 50 }, out, sq, 0))
      .toBe("You need a MID");
  });

  it("says what you can actually afford", () => {
    expect(blockedReason({ id: 103, position: "MID", club_id: 20, now_cost: 80 }, out, sq, 5))
      .toBe("You can afford £5.5m");
  });

  it("flags the club limit", () => {
    const s2 = squad();
    s2[0] = { ...s2[0], club_id: 9 };
    s2[1] = { ...s2[1], club_id: 9 };
    s2[2] = { ...s2[2], club_id: 9 };
    expect(blockedReason({ id: 103, position: "MID", club_id: 9, now_cost: 50 }, s2[5], s2, 100))
      .toBe("Max 3 from that club");
  });

  it("returns null when the move is fine", () => {
    expect(blockedReason({ id: 103, position: "MID", club_id: 20, now_cost: 50 }, out, sq, 0)).toBeNull();
  });
});
