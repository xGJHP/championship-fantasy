"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Gw = { id: number; name: string; finished: boolean };
type Club = { id: number; short_name: string; primary_colour: string };
type Fixture = {
  id: number; gameweek_id: number; home_club_id: number; away_club_id: number;
  home_score: number | null; away_score: number | null; kickoff_time: string; finished: boolean;
};
type Row = {
  player_id: number; web_name: string; position: string; club_id: number;
  minutes: number; goals_scored: number; assists: number; own_goals: number;
  penalties_saved: number; penalties_missed: number; yellow_cards: number;
  red_cards: number; saves: number;
};

const FIELDS: [keyof Row, string, string][] = [
  ["minutes", "Min", "w-14"],
  ["goals_scored", "G", "w-11"],
  ["assists", "A", "w-11"],
  ["saves", "Sv", "w-11"],
  ["yellow_cards", "YC", "w-11"],
  ["red_cards", "RC", "w-11"],
  ["own_goals", "OG", "w-11"],
  ["penalties_saved", "PS", "w-11"],
  ["penalties_missed", "PM", "w-11"],
];

export default function AdminStatEntry({ gameweeks, clubs }: { gameweeks: Gw[]; clubs: Club[] }) {
  const supabase = createClient();
  const clubById = new Map(clubs.map((c) => [c.id, c]));

  const [gw, setGw] = useState<number>(gameweeks[0]?.id ?? 1);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("fixtures").select("*").eq("gameweek_id", gw).order("kickoff_time");
      setFixtures(data ?? []);
      setFixtureId(data?.[0]?.id ?? null);
    })();
  }, [gw]);

  useEffect(() => {
    if (!fixtureId) { setRows([]); return; }
    (async () => {
      setLoading(true);
      const fx = fixtures.find((f) => f.id === fixtureId);
      if (!fx) return;
      const [{ data: players }, { data: existing }] = await Promise.all([
        supabase.from("players").select("id, web_name, position, club_id")
          .in("club_id", [fx.home_club_id, fx.away_club_id])
          .order("position").order("web_name"),
        supabase.from("player_stats").select("*").eq("fixture_id", fixtureId),
      ]);
      const byPlayer = new Map((existing ?? []).map((e: any) => [e.player_id, e]));
      setRows(
        (players ?? []).map((p: any) => {
          const e = byPlayer.get(p.id) ?? {};
          return {
            player_id: p.id, web_name: p.web_name, position: p.position, club_id: p.club_id,
            minutes: e.minutes ?? 0, goals_scored: e.goals_scored ?? 0, assists: e.assists ?? 0,
            own_goals: e.own_goals ?? 0, penalties_saved: e.penalties_saved ?? 0,
            penalties_missed: e.penalties_missed ?? 0, yellow_cards: e.yellow_cards ?? 0,
            red_cards: e.red_cards ?? 0, saves: e.saves ?? 0,
          };
        })
      );
      setLoading(false);
    })();
  }, [fixtureId]);

  const set = (id: number, field: keyof Row, value: number) =>
    setRows((rs) => rs.map((r) => (r.player_id === id ? { ...r, [field]: value } : r)));

  const save = async () => {
    if (!fixtureId) return;
    setStatus("Saving");
    const res = await fetch("/api/admin/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: fixtureId, gameweek_id: gw, rows }),
    });
    setStatus(res.ok ? "Saved" : `Failed: ${await res.text()}`);
    setTimeout(() => setStatus(""), 2500);
  };

  const fx = fixtures.find((f) => f.id === fixtureId);
  const played = rows.filter((r) => r.minutes > 0).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={gw} onChange={(e) => setGw(Number(e.target.value))}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        >
          {gameweeks.map((g) => (
            <option key={g.id} value={g.id}>{g.name}{g.finished ? " (done)" : ""}</option>
          ))}
        </select>

        <select
          value={fixtureId ?? ""} onChange={(e) => setFixtureId(Number(e.target.value))}
          className="min-w-[260px] flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm"
        >
          {fixtures.length === 0 && <option>No fixtures for this gameweek</option>}
          {fixtures.map((f) => (
            <option key={f.id} value={f.id}>
              {clubById.get(f.home_club_id)?.short_name} {f.home_score ?? "-"} v{" "}
              {f.away_score ?? "-"} {clubById.get(f.away_club_id)?.short_name}
            </option>
          ))}
        </select>

        <button onClick={save} disabled={!fixtureId} className="rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink disabled:opacity-40">
          Save stats
        </button>
        {status && <span className="self-center text-sm text-accent">{status}</span>}
      </div>

      {fx && (
        <p className="text-xs text-mute">
          {played} of {rows.length} players marked as having played. Anyone left on 0 minutes
          scores nothing and is eligible to be auto-subbed out.
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-mute">Loading squads</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-mute">
              <tr>
                <th className="px-3 py-2">Player</th>
                <th className="px-2 py-2">Pos</th>
                {FIELDS.map(([k, label]) => (
                  <th key={k as string} className="px-1 py-2 text-center">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player_id} className={i % 2 ? "bg-panel" : "bg-ink"}>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="mr-2 inline-block h-3 w-1 rounded-full align-middle"
                      style={{ background: clubById.get(r.club_id)?.primary_colour }} />
                    <span className="font-semibold">{r.web_name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-mute">{r.position}</td>
                  {FIELDS.map(([k, , w]) => (
                    <td key={k as string} className="px-1 py-1">
                      <input
                        type="number" min={0}
                        value={r[k] as number}
                        onChange={(e) => set(r.player_id, k, Number(e.target.value) || 0)}
                        className={`${w} rounded border border-line bg-ink px-1 py-1 text-center text-xs outline-none focus:border-accent`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-sm text-mute">
                  No players found. Import a squad list first.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
