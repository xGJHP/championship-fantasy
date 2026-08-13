/**
 * Serialising the player list to CSV.
 *
 * Kept separate from the export script so the formatting is testable without
 * a database connection.
 */
export type ExportRow = {
  club_code: string;
  club_id: number;
  web_name: string;
  position: string;
  tm_pos?: string | null;
  now_cost: number;
  start_cost: number;
};

/** Quote a field only when it needs it, so the file stays readable in a diff. */
export function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toFullCsv(rows: ExportRow[]): string {
  const head = "club_code,club_id,web_name,position,tm_pos,now_cost,start_cost";
  const body = rows.map((r) =>
    [r.club_code, r.club_id, r.web_name, r.position, r.tm_pos ?? "", r.now_cost, r.start_cost]
      .map(csvField).join(",")
  );
  return [head, ...body].join("\n") + "\n";
}

/** The narrow version, for pasting straight into the Supabase table editor. */
export function toSimpleCsv(rows: ExportRow[]): string {
  const head = "club_id,web_name,position,now_cost,start_cost";
  const body = rows.map((r) =>
    [r.club_id, r.web_name, r.position, r.now_cost, r.start_cost].map(csvField).join(",")
  );
  return [head, ...body].join("\n") + "\n";
}

/** Sort so the file is stable between exports and diffs cleanly. */
export function sortRows(rows: ExportRow[]): ExportRow[] {
  const order = ["GK", "DEF", "MID", "FWD"];
  return [...rows].sort(
    (a, b) =>
      a.club_code.localeCompare(b.club_code) ||
      order.indexOf(a.position) - order.indexOf(b.position) ||
      b.now_cost - a.now_cost ||
      a.web_name.localeCompare(b.web_name)
  );
}
