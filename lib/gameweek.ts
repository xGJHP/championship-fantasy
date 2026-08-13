export type Gw = { id: number; deadline_time: string; is_next?: boolean; finished?: boolean };

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
