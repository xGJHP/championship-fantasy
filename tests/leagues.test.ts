import { describe, it, expect } from "vitest";
import { generateCode, normaliseCode, isValidCode, displayCode, CODE_LENGTH } from "../lib/league-code";

const AMBIGUOUS = ["0", "O", "1", "I", "L"];

describe("league invite codes", () => {
  it("generates codes of the right length", () => {
    for (let i = 0; i < 200; i++) expect(generateCode()).toHaveLength(CODE_LENGTH);
  });

  it("never includes a character you could misread", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCode();
      AMBIGUOUS.forEach((c) => expect(code).not.toContain(c));
    }
  });

  it("never includes a vowel, so a code cannot spell a word", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCode()).not.toMatch(/[AEIOU]/);
    }
  });

  it("generates codes that validate", () => {
    for (let i = 0; i < 200; i++) expect(isValidCode(generateCode())).toBe(true);
  });

  it("produces a wide spread, so collisions stay unlikely", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(generateCode());
    // 28^6 is about 480 million, so 5000 draws should almost never repeat
    expect(seen.size).toBeGreaterThan(4990);
  });

  it("is deterministic when given a fixed random source", () => {
    const fixed = () => 0;
    expect(generateCode(fixed)).toBe("222222");
  });
});

describe("normalising a pasted code", () => {
  it("uppercases", () => {
    expect(normaliseCode("k7m2qx")).toBe("K7M2QX");
  });

  it("strips spaces, dashes and the FCS prefix", () => {
    expect(normaliseCode("FCS-K7M2QX")).toBe("K7M2QX");
    expect(normaliseCode("K7M 2QX")).toBe("K7M2QX");
    expect(normaliseCode("K7-M2-QX")).toBe("K7M2QX");
  });

  it("drops characters that were never in the alphabet", () => {
    expect(normaliseCode("K7M2QX!!")).toBe("K7M2QX");
    expect(normaliseCode("  k7m2qx  ")).toBe("K7M2QX");
  });

  it("does not silently guess substitutions", () => {
    // O is not in the alphabet. Dropping it leaves a short code, which fails
    // validation, rather than quietly resolving to some other league.
    const out = normaliseCode("K7MOQX");
    expect(out).toBe("K7MQX");
    expect(isValidCode(out)).toBe(false);
  });

  it("truncates anything overlong", () => {
    expect(normaliseCode("K7M2QXZZZZ")).toHaveLength(CODE_LENGTH);
  });

  it("handles an empty or junk input", () => {
    expect(normaliseCode("")).toBe("");
    expect(normaliseCode("!!!")).toBe("");
    expect(isValidCode("")).toBe(false);
  });
});

describe("validation", () => {
  it("rejects wrong lengths", () => {
    expect(isValidCode("K7M2Q")).toBe(false);
    expect(isValidCode("K7M2QXZ")).toBe(false);
  });

  it("rejects ambiguous characters", () => {
    AMBIGUOUS.forEach((c) => expect(isValidCode(`K7M2Q${c}`)).toBe(false));
  });

  it("formats for display", () => {
    expect(displayCode("K7M2QX")).toBe("FCS-K7M2QX");
    // and that display form round trips
    expect(normaliseCode(displayCode("K7M2QX"))).toBe("K7M2QX");
  });
});
