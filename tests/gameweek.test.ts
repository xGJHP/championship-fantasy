import { describe, it, expect, vi, afterEach } from "vitest";
import {
  upcomingGameweek, deadlinePassed, deadlineFor, formatDeadline,
  DEADLINE_MINUTES_BEFORE_KICKOFF, Gw,
} from "../lib/gameweek";

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

describe("when the deadline falls", () => {
  it("locks an hour before the first kickoff", () => {
    expect(DEADLINE_MINUTES_BEFORE_KICKOFF).toBe(60);
    // Gameweek 1: Wolves v Blackburn, 20:00 BST, which is 19:00 UTC
    expect(deadlineFor("2026-08-14T19:00:00Z")).toBe("2026-08-14T18:00:00.000Z");
  });

  it("accepts a Date as well as a string", () => {
    expect(deadlineFor(new Date("2026-08-14T19:00:00Z"))).toBe("2026-08-14T18:00:00.000Z");
  });

  it("handles a kickoff that rolls back past midnight", () => {
    expect(deadlineFor("2026-08-15T00:30:00Z")).toBe("2026-08-14T23:30:00.000Z");
  });
});

describe("showing the deadline to a British audience", () => {
  it("shows British Summer Time, not the server's UTC clock", () => {
    // The bug this replaced: rendered on a UTC server, an 18:00 UTC deadline
    // displayed as 18:00 when the correct British time is 19:00
    const out = formatDeadline("2026-08-14T18:00:00.000Z");
    expect(out).toContain("19:00");
    expect(out).toContain("Fri");
    expect(out).toContain("14 Aug");
  });

  it("shows GMT correctly in winter", () => {
    // No summer time in January, so UTC and British time agree
    expect(formatDeadline("2027-01-16T14:00:00.000Z")).toContain("14:00");
  });

  it("does not shift the date when the clocks are not involved", () => {
    expect(formatDeadline("2027-01-16T14:00:00.000Z")).toContain("16 Jan");
  });

  it("gives the same answer whatever timezone the server runs in", () => {
    const iso = "2026-08-14T18:00:00.000Z";
    const before = process.env.TZ;
    const results = ["UTC", "America/New_York", "Australia/Sydney"].map((tz) => {
      process.env.TZ = tz;
      return formatDeadline(iso);
    });
    process.env.TZ = before;
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toContain("19:00");
  });
});
