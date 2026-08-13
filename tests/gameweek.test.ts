import { describe, it, expect, vi, afterEach } from "vitest";
import { upcomingGameweek, deadlinePassed, Gw } from "../lib/gameweek";

const iso = (offsetHours: number) =>
  new Date(Date.now() + offsetHours * 3600_000).toISOString();

const gws: Gw[] = [
  { id: 1, deadline_time: iso(-200), finished: true },
  { id: 2, deadline_time: iso(-2), finished: false },   // kicked off, not yet scored
  { id: 3, deadline_time: iso(160), finished: false },
];

afterEach(() => vi.useRealTimers());

describe("which gameweek are we picking for", () => {
  it("prefers the one flagged as next", () => {
    const flagged = gws.map((g) => (g.id === 3 ? { ...g, is_next: true } : g));
    expect(upcomingGameweek(flagged)?.id).toBe(3);
  });

  it("falls back to the first with a future deadline", () => {
    expect(upcomingGameweek(gws)?.id).toBe(3);
  });

  it("returns null when there are no gameweeks", () => {
    expect(upcomingGameweek([])).toBeNull();
    expect(upcomingGameweek(null)).toBeNull();
    expect(upcomingGameweek(undefined)).toBeNull();
  });

  it("returns the last gameweek once the season is over", () => {
    const past: Gw[] = [
      { id: 45, deadline_time: iso(-400) },
      { id: 46, deadline_time: iso(-200) },
    ];
    expect(upcomingGameweek(past)?.id).toBe(46);
  });
});

describe("deadline locking", () => {
  it("locks the moment the deadline passes, not when the gameweek is scored", () => {
    // This is the hole: a gameweek can be past its deadline but not yet
    // finished, and a team must still be locked in that window.
    const midGameweek: Gw = { id: 2, deadline_time: iso(-2), finished: false };
    expect(deadlinePassed(midGameweek)).toBe(true);
  });

  it("stays open before the deadline", () => {
    expect(deadlinePassed({ id: 3, deadline_time: iso(1) })).toBe(false);
  });

  it("locks exactly on the deadline", () => {
    const now = new Date("2026-08-14T18:30:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(deadlinePassed({ id: 1, deadline_time: now.toISOString() })).toBe(true);
    expect(deadlinePassed({ id: 1, deadline_time: new Date(now.getTime() + 1000).toISOString() })).toBe(false);
  });

  it("treats a missing gameweek as unlocked", () => {
    expect(deadlinePassed(null)).toBe(false);
  });
});
