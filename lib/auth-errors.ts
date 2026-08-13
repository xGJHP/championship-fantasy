/**
 * Turn Supabase auth errors into something a person can act on.
 *
 * The raw messages leak implementation detail: they name the SDK, mention
 * SvelteKit, and tell the reader to check a redirect allow list. None of that
 * means anything to someone trying to pick a fantasy team, and it looks broken.
 */
export type FriendlyError = { message: string; hint?: string };

const MAP: { match: RegExp; message: string; hint?: string }[] = [
  {
    match: /pkce|code verifier|code challenge/i,
    message: "That sign in link could not be completed.",
    hint: "Links only work in the browser that requested them. Open the link on the same device, or sign in with a password instead.",
  },
  {
    match: /invalid login credentials/i,
    message: "That email and password do not match.",
    hint: "Check for typos, or create an account if you have not already.",
  },
  {
    match: /email not confirmed/i,
    message: "Your email address has not been confirmed yet.",
    hint: "Check your inbox for a confirmation link, including your spam folder.",
  },
  {
    match: /user already registered|already been registered/i,
    message: "There is already an account with that email.",
    hint: "Sign in instead, or reset your password if you have forgotten it.",
  },
  {
    match: /password should be at least|password.*too short/i,
    message: "That password is too short.",
    hint: "Use at least 8 characters.",
  },
  {
    match: /rate limit|too many requests|over_email_send_rate/i,
    message: "Too many attempts just now.",
    hint: "Wait a few minutes and try again, or sign in with a password, which does not need an email.",
  },
  {
    match: /token has expired|otp_expired|expired/i,
    message: "That link or code has expired.",
    hint: "Request a new one.",
  },
  {
    match: /invalid.*token|token.*invalid|otp.*invalid/i,
    message: "That code was not right.",
    hint: "Check the six digits and try again, or request a new code.",
  },
  {
    match: /unable to validate email|invalid.*email/i,
    message: "That does not look like a valid email address.",
  },
  {
    match: /signups not allowed|signup is disabled/i,
    message: "New accounts are closed at the moment.",
  },
  {
    match: /redirect|url.*not allowed/i,
    message: "Sign in could not complete.",
    hint: "Try a password instead. If it keeps happening, let Joey know.",
  },
  {
    match: /network|fetch failed|failed to fetch/i,
    message: "Could not reach the server.",
    hint: "Check your connection and try again.",
  },
];

/** Short codes emitted by /auth/callback, so no provider text reaches the URL. */
const CODES: Record<string, FriendlyError> = {
  link_wrong_device: {
    message: "That sign in link could not be completed.",
    hint: "Links only work in the browser that requested them. Open the link on the same device, or sign in with a password instead.",
  },
  link_expired: {
    message: "That link has expired.",
    hint: "Request a new one, or sign in with a password.",
  },
  link_failed: {
    message: "That sign in link did not work.",
    hint: "Try again, or sign in with a password instead.",
  },
  rate_limited: {
    message: "Too many attempts just now.",
    hint: "Wait a few minutes, or sign in with a password, which does not need an email.",
  },
  unavailable: { message: "Sign in is not available right now." },
};

export function friendlyAuthError(raw: string | null | undefined): FriendlyError | null {
  if (!raw) return null;
  if (CODES[raw]) return CODES[raw];
  for (const m of MAP) {
    if (m.match.test(raw)) return { message: m.message, hint: m.hint };
  }
  return {
    message: "Something went wrong signing you in.",
    hint: "Try again, or use a password instead of an email link.",
  };
}
