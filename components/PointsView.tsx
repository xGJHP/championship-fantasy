"use client";

import { useState } from "react";
import { CLUBS } from "@/data/clubs";
import { Position } from "@/lib/types";
import { PlayerLine, breakdownRows } from "@/lib/points";

export type PlayerMeta = { id: number; web_name: string; club_id: number };

type Props = {
  starters: PlayerLine[];
  bench: PlayerLine[];
  meta: Map<number, PlayerMeta> | Record<number, PlayerMeta>;
  autoSubCount: number;
};

export default function PointsView({ starters, bench, meta, autoSubCount }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const metaOf = (id: number): PlayerMeta | undefined =>
    meta instanceof Map ? meta.get(id) : (meta as Record<number, PlayerMeta>)[id];
  const clubById = new Map(CLUBS.map((c, i) => [i + 1, c]));

  const row = (l: PlayerLine, benched = false) => {
    const m = metaOf(l.player_id);
    const club = clubById.get(m?.club_id ?? 0);
    const isOpen = open === l.player_id;
    const rows = breakdownRows(l.breakdown);

    return (
      <div key={l.player_id} className="rounded-lg border border-line bg-panel2 overflow-hidden">
        <button
          onClick={() => setOpen(isOpen ? null : l.player_id)}
          className="flex w-full items-center gap-2 px-2 py-2 text-left transition hover:bg-line/40"
        >
          <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: club?.primary }} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={`truncate text-sm font-bold ${benched ? "text-mute" : "text-white"}`}>
                {m?.web_name ?? `#${l.player_id}`}
              </span>
              {l.isCaptain && <Badge tone="accent">{l.multiplier === 3 ? "TC" : "C"}</Badge>}
              {l.isVice && !l.isCaptain && <Badge>V</Badge>}
              {l.subbedOn && <Badge tone="accent">ON</Badge>}
              {l.subbedOff && <Badge tone="bad">OFF</Badge>}
              {l.appearances > 1 && <Badge>x{l.appearances}</Badge>}
            </span>
            <span className="block truncate text-[11px] text-mute">
              {club?.shortName} · {l.position} · {l.minutes} min
              {l.multiplier > 1 ? ` · x${l.multiplier}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-lg font-black leading-none ${
              benched ? "text-mute" : l.points < 0 ? "text-bad" : "text-white"
            }`}>
              {benched ? l.rawPoints : l.points}
            </span>
            {l.multiplier > 1 && (
              <span className="block text-[10px] text-mute">{l.rawPoints} x{l.multiplier}</span>
            )}
          </span>
        </button>

        {isOpen && (
          <div className="border-t border-line bg-ink px-3 py-2">
            {rows.length === 0 ? (
              <p className="text-xs text-mute">
                {l.minutes === 0 ? "Did not play." : "No points scored."}
              </p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label}>
                      <td className="py-0.5 text-mute">{r.label}</td>
                      <td className={`py-0.5 text-right font-bold ${r.points < 0 ? "text-bad" : "text-white"}`}>
                        {r.points > 0 ? `+${r.points}` : r.points}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line">
                    <td className="pt-1 font-bold text-white">Total</td>
                    <td className="pt-1 text-right font-black text-accent">{l.rawPoints}</td>
                  </tr>
                  {l.multiplier > 1 && (
                    <tr>
                      <td className="text-mute">Captain multiplier</td>
                      <td className="text-right font-black text-accent">
                        x{l.multiplier} = {l.points}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  const byPos = (pos: Position) => starters.filter((l) => l.position === pos);

  return (
    <div className="space-y-4">
      <div className="pitch p-3 space-y-3">
        {(["GK", "DEF", "MID", "FWD"] as Position[]).map((pos) => {
          const group = byPos(pos);
          if (group.length === 0) return null;
          return (
            <div key={pos} className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.map((l) => row(l))}
            </div>
          );
        })}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-mute">Bench</h3>
          {autoSubCount > 0 && (
            <span className="text-[11px] text-accent">
              {autoSubCount} automatic substitution{autoSubCount === 1 ? "" : "s"} made
            </span>
          )}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {bench.map((l) => row(l, true))}
        </div>
      </div>

      <p className="text-[11px] text-mute">Tap a player to see how their points were made up.</p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: "accent" | "bad" }) {
  const cls =
    tone === "accent" ? "bg-accent text-ink" : tone === "bad" ? "bg-bad text-white" : "bg-line text-white";
  return (
    <span className={`rounded px-1 py-0.5 text-[9px] font-black leading-none ${cls}`}>{children}</span>
  );
}
