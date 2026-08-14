export type Gw = { id: number; deadline_time: string; is_next?: boolean; finished?: boolean };

/**
 * How long before the first kickoff of a gameweek the teams lock.
 *
 * FPL uses 90 minutes. An hour gives people a bit longer and still leaves time
 * to react to team news, which usually lands about an hour before kickoff.
 */
export const DEADLINE_MINUTES_BEFORE_KICKOFF = 60;

/** The deadline for a gameweek whose first match kicks off at `kickoff`. */
export function deadlineFor(kickoff: string | Date): string {
  const t = typeof kickoff === "string" ? new Date(kickoff) : kickoff;
  return new Date(t.getTime() - DEADLINE_MINUTES_BEFORE_KICKOFF * 60_000).toISOString();
}

/**
 * Format a deadline for a British audience.
 *
 * Pinned to Europe/London on purpose. These are rendered in server components,
 * which run in UTC on Vercel, so without this everyone is shown the wrong time
 * for the seven months of the year that British Summer Time is in effect.
 */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

/** The gameweek managers are currently picking for. */
export function upcomingGameweek(gws: Gw[] | null | undefined): Gw | null {
  if (!gws?.length) return null;
  const now = new Date().toISOString();
  return (
    gws.find((g) => g.is_next) ??
    gws.find((g) => g.deadline_time > now) ??
    gws[gws.length - 1] ??
    null
  );
}

export function deadlinePassed(gw: Gw | null): boolean {
  if (!gw) return false;
  return new Date(gw.deadline_time).getTime() <= Date.now();
}
