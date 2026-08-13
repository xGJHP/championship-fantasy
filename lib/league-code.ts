/**
 * Invite codes get read off phone screens and typed into WhatsApp, so the
 * alphabet drops everything confusable: no 0 or O, no 1, I or L, and no vowels,
 * which also stops a code accidentally spelling something unfortunate.
 */
const ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 6;

export function generateCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return out;
}

/**
 * Tidy up whatever was pasted: uppercase it and drop spaces, dashes and any
 * character that was never in the alphabet.
 *
 * Deliberately does NOT guess at substitutions like O to 0. A wrong guess that
 * still produces a valid code would drop someone into the wrong league
 * silently, which is far worse than telling them the code looks wrong.
 */
export function normaliseCode(input: string): string {
  // Strip the display prefix FIRST. Both C and S are valid code characters, so
  // filtering before this would swallow "FCS" into the code itself.
  const withoutPrefix = input.toUpperCase().trim().replace(/^FCS[\s\-_]*/, "");
  return [...withoutPrefix].filter((c) => ALPHABET.includes(c)).join("").slice(0, CODE_LENGTH);
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => ALPHABET.includes(c));
}

/** A code formatted for display, e.g. FCS-K7M2QX */
export function displayCode(code: string): string {
  return `FCS-${code}`;
}
