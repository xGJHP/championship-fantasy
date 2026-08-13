/**
 * Shorten a full name to what should appear on a player card.
 *
 * The pitch has about ten characters of room, so cards show a surname while
 * lists keep the full name. Naive "take the last word" gets a lot of these
 * wrong, so particles are kept with the name they belong to.
 */

/** Words that belong to the surname that follows them. */
const PARTICLES = new Set([
  "van", "von", "de", "del", "della", "der", "den", "dos", "das", "da", "di",
  "du", "la", "le", "el", "al", "bin", "ibn", "ten", "ter", "op", "af", "av",
  "mac", "mc", "st",
]);

/** Suffixes that are not the surname. */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);

export function surname(fullName: string): string {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";

  let parts = cleaned.split(" ");

  // Drop any trailing suffix before working out the surname
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase().replace(/[.,]/g, ""))) {
    parts = parts.slice(0, -1);
  }

  // Mononyms stay as they are: Ronald, Toti, Pablo, Hannibal, Esquerdinha
  if (parts.length === 1) return parts[0];

  // Walk back from the end picking up particles, so "van Ewijk" and
  // "De Norre" survive intact rather than becoming "Ewijk" and "Norre"
  let start = parts.length - 1;
  while (start > 0 && PARTICLES.has(parts[start - 1].toLowerCase().replace(/[.,]/g, ""))) {
    start--;
  }

  // Never return the whole name, otherwise the card gains nothing
  if (start === 0) start = 1;

  return parts.slice(start).join(" ");
}

/** True when shortening would actually change anything. */
export function hasSurname(fullName: string): boolean {
  return surname(fullName) !== fullName.trim();
}

/**
 * Work out what to print on each card across a whole pool of players.
 *
 * A surname alone is ideal, but 22 of the 484 players in the Championship share
 * one and three of them are just "Campbell". Where a surname is not unique the
 * first initial is added, so a pitch never shows the same label twice for
 * different people.
 */
export function buildCardNames(fullNames: string[]): Map<string, string> {
  const bySurname = new Map<string, string[]>();
  for (const full of fullNames) {
    const s = surname(full);
    bySurname.set(s, [...(bySurname.get(s) ?? []), full]);
  }

  const out = new Map<string, string>();
  for (const [short, group] of bySurname) {
    const unique = [...new Set(group)];
    if (unique.length <= 1) {
      group.forEach((full) => out.set(full, short));
      continue;
    }
    for (const full of group) {
      const first = full.trim().split(/\s+/)[0];
      // A mononym has no initial to add, so it keeps the bare name
      out.set(full, first && surname(full) !== first ? `${first[0]}. ${short}` : short);
    }
  }
  return out;
}
