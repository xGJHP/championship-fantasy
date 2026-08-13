import { describe, it, expect } from "vitest";
import { kitStyle, kitSwatchStyle } from "../lib/kit";
import { CLUBS } from "../data/clubs";

describe("kit patterns", () => {
  it("gives every club a pattern and two colours", () => {
    expect(CLUBS).toHaveLength(24);
    CLUBS.forEach((c) => {
      expect(c.pattern).toBeTruthy();
      expect(c.primary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.secondary).toMatch(/^#[0-9A-F]{6}$/i);
      expect(c.primary.toUpperCase()).not.toBe(c.secondary.toUpperCase());
    });
  });

  it("renders a background for every club without throwing", () => {
    CLUBS.forEach((c) => {
      expect(kitStyle(c).background).toBeTruthy();
      expect(kitSwatchStyle(c).background).toBeTruthy();
    });
  });

  it("falls back to a neutral when no club is supplied", () => {
    expect(kitStyle(undefined).background).toBe("#334155");
    expect(kitSwatchStyle(undefined).background).toBe("#334155");
  });

  it("uses a flat fill for solid kits and a gradient for the rest", () => {
    expect(kitStyle({ primary: "#FF0000", secondary: "#FFF", pattern: "solid" }).background)
      .toBe("#FF0000");
    ["stripes", "hoops", "halves", "sleeves", "band"].forEach((pattern) => {
      const bg = String(kitStyle({ primary: "#FF0000", secondary: "#FFF", pattern: pattern as never }).background);
      expect(bg).toContain("gradient");
      expect(bg).toContain("#FF0000");
      expect(bg).toContain("#FFF");
    });
  });

  it("separates the four red and white striped clubs from the plain reds", () => {
    const striped = CLUBS.filter((c) => c.pattern === "stripes").map((c) => c.code);
    expect(striped).toEqual(expect.arrayContaining(["LIN", "SHU", "SOU", "STK", "WBA"]));

    // Every plain red club must differ from every striped one in pattern
    const plainReds = CLUBS.filter((c) => c.pattern === "solid" && /^#(C8|E8|E2|FF)/i.test(c.primary));
    plainReds.forEach((r) => {
      CLUBS.filter((c) => c.pattern === "stripes").forEach((s) => {
        expect(r.pattern).not.toBe(s.pattern);
      });
    });
  });

  it("separates the four red and white striped clubs by stripe width", () => {
    const reds = ["LIN", "SHU", "SOU", "STK"].map(
      (code) => CLUBS.find((c) => c.code === code)!
    );
    const widths = reds.map((c) => c.stripeWidth);
    expect(new Set(widths).size).toBe(4);
    // Widths must be far enough apart to actually read as different
    const sorted = [...widths].sort((a, b) => (a ?? 0) - (b ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      expect((sorted[i] ?? 0) - (sorted[i - 1] ?? 0)).toBeGreaterThanOrEqual(4);
    }
  });

  it("gives every striped club a distinct width", () => {
    const striped = CLUBS.filter((c) => c.pattern === "stripes");
    const widths = striped.map((c) => c.stripeWidth ?? 20);
    expect(new Set(widths).size).toBe(striped.length);
  });

  it("every club has a unique code, which is the database key", () => {
    const codes = CLUBS.map((c) => c.code);
    expect(new Set(codes).size).toBe(24);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]{3}$/));
  });

  it("no two clubs share both colours and pattern", () => {
    const seen = new Set<string>();
    CLUBS.forEach((c) => {
      const key = `${c.primary.toUpperCase()}|${c.secondary.toUpperCase()}|${c.pattern}|${c.stripeWidth ?? 20}|${c.trim ?? ""}`;
      expect(seen.has(key), `${c.shortName} is indistinguishable from another club`).toBe(false);
      seen.add(key);
    });
  });
});
