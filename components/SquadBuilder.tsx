"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Player, Position, POSITIONS } from "@/lib/types";
import { CLUBS } from "@/data/clubs";
import { kitSwatchStyle } from "@/lib/kit";
import { buildCardNames } from "@/lib/name";
import { autoPickSquad } from "@/lib/autopick";
import PlayerChip from "./PlayerChip";
import {
  RULES, validateSquad, validateXI, isValidFormation, formationString, fmtMoney,
  validFormations, Formation,
} from "@/lib/rules";

export type SavedPick = {
  player_id: number; slot: number; is_captain: boolean; is_vice_captain: boolean;
};

type Props = {
  players: Player[];
  demo?: boolean;
  signedIn?: boolean;
  locked?: boolean;
  initialPicks?: SavedPick[];
  initialTeamName?: string;
  gameweek?: number | null;
};

const DEFAULT_FORMATION: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

export default function SquadBuilder({
  players, demo, signedIn, locked, initialPicks = [], initialTeamName = "", gameweek,
}: Props) {
  const router = useRouter();

  const sorted = [...initialPicks].sort((a, b) => a.slot - b.slot);
  const [squadIds, setSquadIds] = useState<number[]>(sorted.map((p) => p.player_id));
  const [xiIds, setXiIds] = useState<number[]>(
    sorted.filter((p) => p.slot <= 11).map((p) => p.player_id)
  );
  const [captain, setCaptain] = useState<number | null>(
    sorted.find((p) => p.is_captain)?.player_id ?? null
  );
  const [vice, setVice] = useState<number | null>(
    sorted.find((p) => p.is_vice_captain)?.player_id ?? null
  );
  const [teamName, setTeamName] = useState(initialTeamName);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // filters
  const [posFilter, setPosFilter] = useState<Position | "ALL">("ALL");
  const [clubFilter, setClubFilter] = useState<number | "ALL">("ALL");
  // Slider bounds come from the pool itself. Hardcoding them means the filter
  // silently hides players the moment someone is repriced above the ceiling.
  const priceBounds = useMemo(() => {
    if (players.length === 0) return { lo: 40, hi: 150 };
    const costs = players.map((p) => p.now_cost);
    return {
      lo: Math.floor(Math.min(...costs) / 5) * 5,
      hi: Math.ceil(Math.max(...costs) / 5) * 5,
    };
  }, [players]);

  const [maxCost, setMaxCost] = useState<number | null>(null);
  const effectiveMax = maxCost ?? priceBounds.hi;
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"total_points" | "now_cost" | "form">("total_points");

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  // Cards show a surname, lists keep the full name. Computed across the whole
  // pool so a shared surname picks up an initial.
  const cardNames = useMemo(
    () => buildCardNames(players.map((p) => p.web_name)),
    [players]
  );
  const cardName = (p: Player) => cardNames.get(p.web_name) ?? p.web_name;
  const clubById = useMemo(() => new Map(CLUBS.map((c, i) => [i + 1, c])), []);
  const squad = useMemo(
    () => squadIds.map((id) => byId.get(id)!).filter(Boolean),
    [squadIds, byId]
  );

  const spend = squad.reduce((t, p) => t + p.now_cost, 0);
  const bank = RULES.budget - spend;

  const xi = xiIds.map((id) => byId.get(id)!).filter(Boolean);
  const bench = squad.filter((p) => !xiIds.includes(p.id));

  const xiCounts = useMemo(() => {
    const c: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    xi.forEach((p) => c[p.position]++);
    return c;
  }, [xi]);

  const posCount = (pos: Position) => squad.filter((p) => p.position === pos).length;
  const clubCount = (clubId: number) => squad.filter((p) => p.club_id === clubId).length;

  /* ------------------------------- actions ------------------------------ */

  const canAdd = useCallback(
    (p: Player): string | null => {
      if (squadIds.includes(p.id)) return "Already in your squad";
      if (posCount(p.position) >= RULES.squadQuota[p.position])
        return `You already have ${RULES.squadQuota[p.position]} ${p.position}`;
      if (clubCount(p.club_id) >= RULES.maxPerClub)
        return `Max ${RULES.maxPerClub} from ${clubById.get(p.club_id)?.shortName}`;
      if (p.now_cost > bank) return "Not enough in the bank";
      return null;
    },
    [squadIds, squad, bank, clubById]
  );

  const addPlayer = (p: Player) => {
    if (canAdd(p)) return;
    setSquadIds((s) => [...s, p.id]);
    // Drop straight into the XI if the current shape has room
    const target = DEFAULT_FORMATION[p.position];
    const inXi = xiIds.filter((id) => byId.get(id)?.position === p.position).length;
    if (xiIds.length < 11 && inXi < target) setXiIds((s) => [...s, p.id]);
  };

  const removePlayer = (id: number) => {
    setSquadIds((s) => s.filter((x) => x !== id));
    setXiIds((s) => s.filter((x) => x !== id));
    if (captain === id) setCaptain(null);
    if (vice === id) setVice(null);
  };

  /** Swap two players between XI and bench, if the resulting shape is legal. */
  const swap = (aId: number, bId: number) => {
    const a = byId.get(aId), b = byId.get(bId);
    if (!a || !b || aId === bId) return;
    const aIn = xiIds.includes(aId), bIn = xiIds.includes(bId);
    if (aIn === bIn) return; // both starting or both benched, nothing to do

    const starter = aIn ? a : b;
    const sub = aIn ? b : a;

    // Keepers only swap with keepers
    if ((starter.position === "GK") !== (sub.position === "GK")) return;

    const next = { ...xiCounts };
    next[starter.position]--;
    next[sub.position]++;
    if (!isValidFormation(next)) return;

    setXiIds((s) => s.map((id) => (id === starter.id ? sub.id : id)));
    if (captain === starter.id) setCaptain(sub.id);
    if (vice === starter.id) setVice(sub.id);
  };

  /**
   * Fills whatever is missing. Anyone already picked stays exactly where they
   * are, so this doubles as "finish my team off" once you have chosen the
   * players you actually care about.
   */
  const autoPick = () => {
    const result = autoPickSquad(
      players.map((p) => ({
        id: p.id, club_id: p.club_id, position: p.position,
        now_cost: p.now_cost, total_points: p.total_points, status: p.status,
      })),
      { keep: squadIds }
    );

    if (!result.ok) {
      setSaveMsg({ ok: false, text: result.reason });
      return;
    }

    setSquadIds(result.squad.map((p) => p.id));
    setXiIds(result.xi);
    // Only take the suggested armband if they have not already chosen one
    if (!captain || !result.xi.includes(captain)) setCaptain(result.captainId);
    if (!vice || !result.xi.includes(vice)) setVice(result.viceId);

    setSaveMsg(
      result.added.length && result.kept.length
        ? { ok: true, text: `Added ${result.added.length} player${result.added.length === 1 ? "" : "s"} around the ${result.kept.length} you picked.` }
        : null
    );
  };

  const reset = () => {
    setSquadIds([]); setXiIds([]); setCaptain(null); setVice(null);
  };

  /**
   * Switch shape by rebuilding the eleven: keep the best available player in
   * each position by points, then price. Anyone displaced drops to the bench.
   */
  const applyFormation = (f: Formation) => {
    const target: Record<Position, number> = { GK: 1, ...f };
    const next: number[] = [];

    (["GK", "DEF", "MID", "FWD"] as Position[]).forEach((pos) => {
      const available = squad
        .filter((p) => p.position === pos)
        .sort((a, b) => {
          // Players already starting keep their place where possible
          const aStarting = xiIds.includes(a.id) ? 1 : 0;
          const bStarting = xiIds.includes(b.id) ? 1 : 0;
          if (aStarting !== bStarting) return bStarting - aStarting;
          return b.total_points - a.total_points || b.now_cost - a.now_cost;
        });
      available.slice(0, target[pos]).forEach((p) => next.push(p.id));
    });

    if (next.length !== RULES.xiSize) return; // not enough players yet
    setXiIds(next);
    if (captain && !next.includes(captain)) setCaptain(null);
    if (vice && !next.includes(vice)) setVice(null);
  };

  const canPlayFormation = (f: Formation) => {
    const target: Record<Position, number> = { GK: 1, ...f };
    return (["GK", "DEF", "MID", "FWD"] as Position[]).every(
      (pos) => posCount(pos) >= target[pos]
    );
  };

  /* ------------------------------ validation ---------------------------- */

  const squadErrors = validateSquad(
    squad.map((p) => ({ id: p.id, position: p.position, club_id: p.club_id, cost: p.now_cost }))
  );
  const xiErrors =
    squad.length === 15
      ? validateXI(xi.map((p) => ({ id: p.id, position: p.position, club_id: p.club_id, cost: p.now_cost })))
      : [];
  const blockers: string[] = [];
  if (squad.length !== 15) blockers.push(`Pick ${15 - squad.length} more player${15 - squad.length === 1 ? "" : "s"}`);
  squadErrors.forEach((e) => blockers.push(e.message));
  xiErrors.forEach((e) => blockers.push(e.message));
  if (squad.length === 15 && !captain) blockers.push("Choose a captain by clicking a player on the pitch");
  if (squad.length === 15 && captain && !vice) blockers.push("Choose a vice captain by clicking your captain again, then another player");
  if (captain && !xiIds.includes(captain)) blockers.push("Your captain has to start");
  if (vice && !xiIds.includes(vice)) blockers.push("Your vice captain has to start");
  if (squad.length === 15 && !teamName.trim()) blockers.push("Give your team a name");
  const complete = blockers.length === 0 && squad.length === 15;

  const save = async () => {
    if (locked) {
      setSaveMsg({ ok: false, text: "The deadline has passed. Your team is locked." });
      return;
    }
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent("/squad")}`);
      return;
    }
    setSaving(true); setSaveMsg(null);

    // Slot order is not cosmetic. Auto-subs read slot 12 as the reserve keeper
    // and bring the rest on in slot order, so the bench must be GK first.
    const posRank: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
    const orderedXi = [...xi].sort((a, b) => posRank[a.position] - posRank[b.position]);
    const orderedBench = [...bench].sort((a, b) => {
      if ((a.position === "GK") !== (b.position === "GK")) return a.position === "GK" ? -1 : 1;
      return posRank[a.position] - posRank[b.position];
    });

    const payload = {
      teamName: teamName.trim(),
      picks: [
        ...orderedXi.map((p, i) => ({
          player_id: p.id, slot: i + 1,
          is_captain: captain === p.id, is_vice_captain: vice === p.id,
        })),
        ...orderedBench.map((p, i) => ({
          player_id: p.id, slot: 12 + i, is_captain: false, is_vice_captain: false,
        })),
      ],
    };

    const res = await fetch("/api/squad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({ message: "Something went wrong." }));
    setSaving(false);

    if (res.ok) {
      setSaveMsg({ ok: true, text: `Saved for Gameweek ${json.gameweek}.` });
      router.refresh();
    } else {
      if (res.status === 401) { router.push(`/login?next=${encodeURIComponent("/squad")}`); return; }
      setSaveMsg({ ok: false, text: json.message ?? "Could not save." });
    }
  };

  /* -------------------------------- list -------------------------------- */

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => (posFilter === "ALL" ? true : p.position === posFilter))
      .filter((p) => (clubFilter === "ALL" ? true : p.club_id === clubFilter))
      .filter((p) => p.now_cost <= effectiveMax)
      .filter((p) =>
        q ? `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) : true
      )
      .sort((a, b) =>
        sortBy === "now_cost" ? b.now_cost - a.now_cost : (b[sortBy] as number) - (a[sortBy] as number)
      )
      .slice(0, 80);
  }, [players, posFilter, clubFilter, effectiveMax, search, sortBy]);

  /* ------------------------------- render ------------------------------- */

  const renderRow = (pos: Position) => {
    const inRow = xi.filter((p) => p.position === pos);

    // Empty slots are a hint for someone still filling their 15. Once the squad
    // is complete the pitch shows the real shape and nothing else, otherwise a
    // 3-5-2 keeps displaying a phantom fourth defender.
    const stillNeeded = RULES.squadQuota[pos] - posCount(pos);
    const blanks =
      squad.length === RULES.squadSize
        ? 0
        : Math.max(0, Math.min(stillNeeded, DEFAULT_FORMATION[pos] - inRow.length));

    return (
      <div key={pos} className="flex flex-wrap items-center justify-center gap-2 py-1.5 md:gap-3">
        {inRow.map((p) => (
          <div key={p.id} className="group/slot relative">
            <button
              onClick={(e) => { e.stopPropagation(); removePlayer(p.id); }}
              title="Remove from squad"
              className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 place-items-center rounded-full bg-bad text-[10px] font-black text-white group-hover/slot:grid"
            >
              x
            </button>
          <PlayerChip
            player={p}
            displayName={cardName(p)}
            club={clubById.get(p.club_id)}
            position={pos}
            isCaptain={captain === p.id}
            isVice={vice === p.id}
            dropping={dropTarget === `p-${p.id}`}
            onClick={() => cyclePlayerAction(p.id)}
            onDragStart={() => setDragId(p.id)}
            onDragOver={(e) => { e.preventDefault(); setDropTarget(`p-${p.id}`); }}
            onDrop={(e) => { e.preventDefault(); if (dragId) swap(dragId, p.id); setDragId(null); setDropTarget(null); }}
          />
          </div>
        ))}
        {Array.from({ length: blanks }).map((_, i) => (
          <PlayerChip
            key={`blank-${pos}-${i}`}
            player={null}
            position={pos}
            onClick={() => setPosFilter(pos)}
          />
        ))}
      </div>
    );
  };

  /** Click cycles captain, then vice, then clears. Removal is the separate x. */
  const cyclePlayerAction = (id: number) => {
    if (captain === id) { setCaptain(null); setVice(id); return; }
    if (vice === id) { setVice(null); return; }
    setCaptain(id);
    if (vice === id) setVice(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* ------------------------------ pitch ------------------------------ */}
      <section>
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Players" value={`${squad.length}/15`} />
          <Stat label="In the bank" value={fmtMoney(bank)} tone={bank < 0 ? "bad" : "good"} />
          <Stat label="Shape" value={formationString(xiCounts)} />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-black uppercase tracking-wider text-mute">
            Shape
          </span>
          {validFormations().map((f) => {
            const label = `${f.DEF}-${f.MID}-${f.FWD}`;
            const active = formationString(xiCounts) === label;
            const possible = canPlayFormation(f);
            return (
              <button
                key={label}
                onClick={() => applyFormation(f)}
                disabled={!possible}
                title={possible ? `Switch to ${label}` : "You do not have the players for that yet"}
                className={`rounded-md px-2 py-1 text-xs font-black transition ${
                  active
                    ? "bg-accent text-ink"
                    : "bg-panel2 text-mute hover:text-white disabled:opacity-30 disabled:hover:text-mute"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="pitch px-2 py-3 md:px-4 md:py-5">
          {(["GK", "DEF", "MID", "FWD"] as Position[]).map(renderRow)}
        </div>

        <div className="mt-3 rounded-xl border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-mute">Bench</h3>
            <span className="text-[11px] text-mute">Drag on to the pitch to swap</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {bench.length === 0 && (
              <p className="py-3 text-xs text-mute">Your bench fills up as you pick your 15.</p>
            )}
            {bench.map((p) => (
              <PlayerChip
                key={p.id}
                player={p}
                displayName={cardName(p)}
                club={clubById.get(p.club_id)}
                position={p.position}
                compact
                dropping={dropTarget === `p-${p.id}`}
                onClick={() => removePlayer(p.id)}
                onDragStart={() => setDragId(p.id)}
                onDragOver={(e) => { e.preventDefault(); setDropTarget(`p-${p.id}`); }}
                onDrop={(e) => { e.preventDefault(); if (dragId) swap(dragId, p.id); setDragId(null); setDropTarget(null); }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={autoPick} className="rounded-lg bg-panel2 px-3 py-2 text-sm font-bold text-white hover:bg-line">
            {squad.length === 0
              ? "Auto pick"
              : squad.length === RULES.squadSize
              ? "Rebuild the rest"
              : `Fill the other ${RULES.squadSize - squad.length}`}
          </button>
          <button onClick={reset} className="rounded-lg bg-panel2 px-3 py-2 text-sm font-bold text-white hover:bg-line">
            Reset
          </button>
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Team name"
            maxLength={40}
            className="ml-auto w-40 rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
          />
          <button
            onClick={save}
            disabled={!complete || saving || !!locked}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-mute"
          >
            {locked ? "Deadline passed" : saving ? "Saving" : signedIn ? "Save squad" : "Sign in to save"}
          </button>
        </div>

        {saveMsg && (
          <p className={`mt-3 rounded-lg border p-3 text-sm ${
            saveMsg.ok ? "border-accent/40 bg-accent/10 text-accent" : "border-bad/40 bg-bad/10 text-bad"
          }`}>
            {saveMsg.text}
          </p>
        )}

        {blockers.length > 0 && squad.length > 0 && (
          <div className="mt-3 rounded-lg border border-warn/40 bg-warn/10 p-3">
            <p className="mb-1 text-xs font-black uppercase tracking-wider text-warn">
              Before you can save
            </p>
            <ul className="space-y-1 text-xs text-warn">
              {blockers.map((b, i) => <li key={i}>- {b}</li>)}
            </ul>
          </div>
        )}

        {complete && !saveMsg && (
          <p className="mt-3 text-xs text-accent">
            Ready to save{gameweek ? ` for Gameweek ${gameweek}` : ""}.
          </p>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-mute">
          Click a player to make them captain, click again to make them vice, once more to
          clear. Hover a card and hit the red x to drop them. Pick a shape above, or drag
          between the pitch and the bench for finer control.
        </p>
      </section>

      {/* ------------------------------- list ------------------------------ */}
      <aside className="rounded-xl border border-line bg-panel p-3">
        {demo && (
          <p className="mb-3 rounded-md border border-warn/40 bg-warn/10 p-2 text-[11px] leading-relaxed text-warn">
            Demo mode. These are placeholder names on a generated price list, so you can try
            the interface. Connect Supabase and import a squad list to use real data.
          </p>
        )}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players"
          className="mb-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
        />

        <div className="mb-2 flex gap-1">
          {(["ALL", ...POSITIONS] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPosFilter(p as Position | "ALL")}
              className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                posFilter === p ? "bg-accent text-ink" : "bg-panel2 text-mute hover:text-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="mb-2 grid grid-cols-2 gap-2">
          <select
            value={clubFilter}
            onChange={(e) => setClubFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
            className="rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="ALL">All clubs</option>
            {CLUBS.map((c, i) => (
              <option key={c.code} value={i + 1}>{c.shortName}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
          >
            <option value="total_points">Total points</option>
            <option value="now_cost">Price</option>
            <option value="form">Form</option>
          </select>
        </div>

        <label className="mb-3 block text-[11px] font-semibold text-mute">
          <span className="flex items-center justify-between">
            <span>Max price {fmtMoney(effectiveMax)}</span>
            {effectiveMax < priceBounds.hi && (
              <button
                type="button"
                onClick={() => setMaxCost(null)}
                className="font-bold text-accent hover:underline"
              >
                clear
              </button>
            )}
          </span>
          <input
            type="range"
            min={priceBounds.lo}
            max={priceBounds.hi}
            step={5}
            value={effectiveMax}
            onChange={(e) => setMaxCost(Number(e.target.value))}
            className="mt-1 w-full accent-[var(--accent)]"
          />
          <span className="mt-0.5 flex justify-between text-[10px] text-mute">
            <span>{fmtMoney(priceBounds.lo)}</span>
            <span>{fmtMoney(priceBounds.hi)}</span>
          </span>
        </label>

        <div className="max-h-[540px] space-y-1 overflow-y-auto pr-1">
          {filtered.map((p) => {
            const reason = canAdd(p);
            const club = clubById.get(p.club_id);
            return (
              <button
                key={p.id}
                onClick={() => addPlayer(p)}
                disabled={!!reason}
                title={reason ?? "Add to squad"}
                className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-panel2 px-2 py-1.5 text-left transition enabled:hover:border-accent/60 disabled:opacity-40"
              >
                <span
                  className="h-7 w-1.5 shrink-0 rounded-full"
                  style={kitSwatchStyle(club)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-white">
                    {p.web_name}
                    {p.status !== "a" && (
                      <span className={`ml-1 text-[10px] ${p.status === "d" ? "text-warn" : "text-bad"}`}>
                        {p.status === "d" ? "75%" : "OUT"}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[10px] text-mute">
                    {club?.shortName} · {p.position}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-black text-accent">{fmtMoney(p.now_cost)}</span>
                  <span className="block text-[10px] text-mute">{p.total_points} pts</span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-xs text-mute">No players match those filters.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`text-base font-black ${tone === "bad" ? "text-bad" : "text-white"}`}>{value}</div>
    </div>
  );
}
