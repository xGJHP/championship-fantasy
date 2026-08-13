"use client";

import { useMemo, useState } from "react";
import { Position } from "@/lib/types";
import { fmtMoney } from "@/lib/rules";
import { START_STEP, isValidStartPrice } from "@/lib/pricing";

type P = {
  id: number; club_id: number; web_name: string; position: Position;
  now_cost: number; start_cost: number; status: string;
};
type Club = { id: number; short_name: string; primary_colour: string };

const STATUS: { value: string; label: string }[] = [
  { value: "a", label: "Available" },
  { value: "d", label: "Doubtful" },
  { value: "i", label: "Injured" },
  { value: "s", label: "Suspended" },
  { value: "u", label: "Left the club" },
];

function StatusSelect({ player }: { player: P }) {
  const [value, setValue] = useState(player.status);
  const [saving, setSaving] = useState(false);

  const change = async (next: string) => {
    setValue(next);
    setSaving(true);
    await fetch("/api/admin/players", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: player.id, status: next }),
    }).catch(() => {});
    setSaving(false);
  };

  return (
    <select
      value={value}
      onChange={(e) => change(e.target.value)}
      className={`rounded border bg-ink px-1 py-1 text-xs outline-none ${
        saving ? "border-accent" : value === "a" ? "border-line text-mute" : "border-warn text-warn"
      }`}
    >
      {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

export default function PriceEditor({ players, clubs }: { players: P[]; clubs: Club[] }) {
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const [edits, setEdits] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [club, setClub] = useState<number | "ALL">("ALL");
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const priceOf = (p: P) => edits[p.id] ?? p.now_cost;
  const dirty = Object.entries(edits).filter(([id, v]) => {
    const p = players.find((x) => x.id === Number(id));
    return p && v !== p.now_cost;
  });

  const bump = (p: P, dir: 1 | -1) => {
    const next = Math.max(40, Math.min(200, priceOf(p) + dir * START_STEP));
    setEdits((e) => ({ ...e, [p.id]: next }));
  };

  const setExact = (p: P, valueM: string) => {
    const tenths = Math.round(parseFloat(valueM) * 10);
    if (!Number.isFinite(tenths)) return;
    setEdits((e) => ({ ...e, [p.id]: tenths }));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => (club === "ALL" ? true : p.club_id === club))
      .filter((p) => (pos === "ALL" ? true : p.position === pos))
      .filter((p) => (q ? p.web_name.toLowerCase().includes(q) : true))
      .slice(0, 200);
  }, [players, search, club, pos]);

  const save = async () => {
    const payload = dirty.map(([id, now_cost]) => ({ id: Number(id), now_cost }));
    const offGrid = payload.filter((r) => !isValidStartPrice(r.now_cost));
    if (offGrid.length) {
      setStatus(`${offGrid.length} price(s) are not a whole 0.5m step. Fix those first.`);
      return;
    }
    setBusy(true);
    setStatus("Saving");
    const res = await fetch("/api/admin/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payload }),
    });
    setBusy(false);
    if (res.ok) {
      const { saved } = await res.json();
      setStatus(`Saved ${saved}. Refresh to confirm.`);
    } else {
      setStatus(`Failed: ${await res.text()}`);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search player"
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select value={club} onChange={(e) => setClub(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm">
          <option value="ALL">All clubs</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value as Position | "ALL")}
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm">
          <option value="ALL">All positions</option>
          {["GK","DEF","MID","FWD"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={save} disabled={busy || dirty.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink disabled:opacity-40">
          {dirty.length ? `Save ${dirty.length} change${dirty.length > 1 ? "s" : ""}` : "No changes"}
        </button>
        {dirty.length > 0 && (
          <button onClick={() => { setEdits({}); setStatus(""); }}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-mute hover:text-white">
            Discard
          </button>
        )}
      </div>

      {status && <p className="text-sm text-accent">{status}</p>}

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-mute">
            <tr>
              <th className="px-3 py-2">Player</th>
              <th className="px-2 py-2">Club</th>
              <th className="px-2 py-2">Pos</th>
              <th className="px-2 py-2 text-right">Opening</th>
              <th className="px-2 py-2 text-center">Price</th>
              <th className="px-2 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const val = priceOf(p);
              const changed = val !== p.now_cost;
              const bad = !isValidStartPrice(val);
              return (
                <tr key={p.id} className={`${i % 2 ? "bg-panel" : "bg-ink"} ${changed ? "ring-1 ring-inset ring-accent/40" : ""}`}>
                  <td className="whitespace-nowrap px-3 py-1.5 font-semibold">
                    {p.web_name}
                    {p.status !== "a" && <span className="ml-2 text-[10px] text-warn">flagged</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="mr-1.5 inline-block h-3 w-1 rounded-full align-middle"
                      style={{ background: clubById.get(p.club_id)?.primary_colour }} />
                    <span className="text-xs text-mute">{clubById.get(p.club_id)?.short_name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-mute">{p.position}</td>
                  <td className="px-2 py-1.5 text-right text-xs text-mute">{fmtMoney(p.start_cost)}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => bump(p, -1)}
                        className="h-7 w-7 rounded border border-line bg-panel2 font-bold text-mute hover:text-white">-</button>
                      <input
                        type="number" step="0.5" min="4"
                        value={(val / 10).toFixed(1)}
                        onChange={(e) => setExact(p, e.target.value)}
                        className={`w-20 rounded border bg-ink px-1 py-1 text-center text-sm font-bold outline-none ${
                          bad ? "border-bad text-bad" : changed ? "border-accent text-accent" : "border-line text-white"
                        }`}
                      />
                      <button onClick={() => bump(p, 1)}
                        className="h-7 w-7 rounded border border-line bg-panel2 font-bold text-mute hover:text-white">+</button>
                    </div>
                    {bad && <p className="mt-0.5 text-center text-[10px] text-bad">must be a 0.5 step</p>}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <StatusSelect player={p} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-mute">
        Showing {filtered.length} of {players.length}. Narrow the search to see more.
      </p>
    </div>
  );
}
