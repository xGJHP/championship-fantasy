import { describe, it, expect } from "vitest";
import { surname, hasSurname, buildCardNames } from "../lib/name";

describe("surname on the player card", () => {
  it("takes the last word for an ordinary name", () => {
    expect(surname("Jarrod Bowen")).toBe("Bowen");
    expect(surname("Zan Vipotnik")).toBe("Vipotnik");
    expect(surname("Christoph Klarer")).toBe("Klarer");
  });

  it("keeps hyphenated surnames whole", () => {
    expect(surname("Kyle Walker-Peters")).toBe("Walker-Peters");
    expect(surname("Taylor Harwood-Bellis")).toBe("Harwood-Bellis");
    expect(surname("Bright Osayi-Samuel")).toBe("Osayi-Samuel");
    expect(surname("Rhys Norrington-Davies")).toBe("Norrington-Davies");
    expect(surname("Jean-Clair Todibo")).toBe("Todibo");
  });

  it("leaves a mononym alone", () => {
    ["Ronald", "Toti", "Pablo", "Hannibal", "Welington", "Esquerdinha", "Andre"]
      .forEach((n) => expect(surname(n)).toBe(n));
  });

  it("keeps particles attached", () => {
    expect(surname("Milan van Ewijk")).toBe("van Ewijk");
    expect(surname("Casper De Norre")).toBe("De Norre");
    expect(surname("Virgil van Dijk")).toBe("van Dijk");
    expect(surname("Kevin De Bruyne")).toBe("De Bruyne");
  });

  it("takes the last word of a three part name", () => {
    expect(surname("El Hadji Malick Diouf")).toBe("Diouf");
    expect(surname("David Moller Wolfe")).toBe("Wolfe");
    expect(surname("Jacob Widell Zetterstrom")).toBe("Zetterstrom");
    expect(surname("Ben Brereton Diaz")).toBe("Diaz");
  });

  it("handles accents and unusual characters", () => {
    expect(surname("Edson Álvarez")).toBe("Álvarez");
    expect(surname("Tomáš Souček")).toBe("Souček");
    expect(surname("Raúl Jiménez")).toBe("Jiménez");
    expect(surname("Amari'i Bell")).toBe("Bell");
    expect(surname("Callum O'Hare")).toBe("O'Hare");
  });

  it("drops a trailing suffix", () => {
    expect(surname("Vitor Roque Jr")).toBe("Roque");
    expect(surname("Ken Smith III")).toBe("Smith");
  });

  it("copes with messy input", () => {
    expect(surname("  Jarrod   Bowen  ")).toBe("Bowen");
    expect(surname("")).toBe("");
    expect(surname("   ")).toBe("");
  });

  it("never returns the entire name for a multi word name", () => {
    // A name made only of particles should still shorten to something
    expect(surname("van der")).toBe("der");
  });

  it("reports whether shortening changes anything", () => {
    expect(hasSurname("Jarrod Bowen")).toBe(true);
    expect(hasSurname("Ronald")).toBe(false);
  });
});

describe("card names across a whole pool", () => {
  it("uses the bare surname when it is unique", () => {
    const m = buildCardNames(["Jarrod Bowen", "Zan Vipotnik"]);
    expect(m.get("Jarrod Bowen")).toBe("Bowen");
    expect(m.get("Zan Vipotnik")).toBe("Vipotnik");
  });

  it("adds an initial when a surname is shared", () => {
    const m = buildCardNames(["Patrick Roberts", "Connor Roberts", "Jarrod Bowen"]);
    expect(m.get("Patrick Roberts")).toBe("P. Roberts");
    expect(m.get("Connor Roberts")).toBe("C. Roberts");
    expect(m.get("Jarrod Bowen")).toBe("Bowen");
  });

  it("handles three players sharing a surname", () => {
    const m = buildCardNames(["Tyreece Campbell", "Tyrese Campbell", "George Campbell"]);
    expect(m.get("George Campbell")).toBe("G. Campbell");
    expect(new Set([...m.values()]).size).toBeGreaterThan(1);
  });

  it("leaves a mononym alone even in a clash", () => {
    const m = buildCardNames(["Ronald", "Cristiano Ronald"]);
    expect(m.get("Ronald")).toBe("Ronald");
    expect(m.get("Cristiano Ronald")).toBe("C. Ronald");
  });

  it("covers every name it is given", () => {
    const names = ["Jarrod Bowen", "Ronald", "Casper De Norre", "Kyle Walker-Peters"];
    const m = buildCardNames(names);
    names.forEach((n) => expect(m.get(n)).toBeTruthy());
  });
});
