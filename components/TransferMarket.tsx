"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Player, Position, POSITIONS, ChipName } from "@/lib/types";
import { CLUBS } from "@/data/clubs";
import { kitSwatchStyle } from "@/lib/kit";
import { fmtMoney, RULES } from "@/lib/rules";
import { validateTransfers, blockedReason, SquadSlot, MarketPlayer } from "@/lib/transfers";

type Props = {
  squad: SquadSlot[];
  players: Player[];
  bank: number;
  freeTransfers: number;
  gameweek: number;
  chipsUsed: ChipName[];
};

const CHIP_INFO: { name: ChipName; label: string; blurb: string }[] = [
  { name: "wildcard", label: "Wildcard", blurb: "Unlimited free transfers, permanent" },
  { name: "freehit", label: "Free Hit", blurb: "Unlimited free transfers, reverts next week" },
];

export default function TransferMarket({
  squad, players, bank, freeTransfers, gameweek, chipsUsed,
}: Props) {
  const router = useRouter();
  const clubById = useMemo(() => new Map(CLUBS.map((c, i) => [i + 1, c])), []);
  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const market = useMemo(() => {
    const m = new Map<number, MarketPlayer>();
    players.forEach((p) =>
      m.set(p.id, { id: p.id, position: p.position, club_id: p.club_id, now_cost: p.now_cost })
    );
    return m;
  }, [players]);

  const [pairs, setPairs] = useState<{ out: SquadSlot; in: Player | null }[]>([]);
  const [chip, setChip] = useState<ChipName | null>(null);
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState<number | "ALL">("ALL");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const activeSlot = pairs.find((p) => p.in === null) ?? null;
  const completed = pairs.filter((p) => p.in !== null);

  // Live validation of whatever is currently staged
  const check = useMemo(() => validateTransfers({
    squad,
    transfers: completed.map((p) => ({ out_id: p.out.player_id, in_id: p.in!.id })),
    market, bank, freeTransfers, chip,
  }), [completed, squad, market, bank, freeTransfers, chip]);

  // Money available while a slot is open
  const spendable = activeSlot
    ? check.bankAfter + activeSlot.out.selling_price
    : check.bankAfter;

  const startTransfer = (slot: SquadSlot) => {
    if (pairs.some((p) => p.out.player_id === slot.player_id)) {
      setPairs((ps) => ps.filter((p) => p.out.player_id !== slot.player_id));
      return;
    }
    setPairs((ps) => [...ps.filter((p) => p.in !== null), { out: slot, in: null }]);
    setMsg(null);
  };

  const pickReplacement = (p: Player) => {
    if (!activeSlot) return;
    setPairs((ps) => ps.map((x) => (x.out.player_id === activeSlot.out.player_id ? { ...x, in: p } : x)));
  };

  const undo = (outId: number) => setPairs((ps) => ps.filter((p) => p.out.player_id !== outId));
  const reset = () => { setPairs([]); setChip(null); setMsg(null); };

  const confirm = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transfers: completed.map((p) => ({ out_id: p.out.player_id, in_id: p.in!.id })),
        chip,
      }),
    });
    const json = await res.json().catch(() => ({ message: "Something went wrong." }));
    setBusy(false);
    if (res.ok) {
      setMsg({
        ok: true,
        text: `${json.transfersMade} transfer${json.transfersMade === 1 ? "" : "s"} confirmed${
          json.pointsCost ? `, costing ${json.pointsCost} points` : ", free"
        }.`,
      });
      setPairs([]); setChip(null);
      router.refresh();
    } else {
      setMsg({ ok: false, text: json.message ?? "Could not make those transfers." });
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => (activeSlot ? p.position === activeSlot.out.position : true))
      .filter((p) => (clubFilter === "ALL" ? true : p.club_id === clubFilter))
      .filter((p) => (q ? p.web_name.toLowerCase().includes(q) : true))
      .filter((p) => !squad.some((s) => s.player_id === p.id))
      .filter((p) => !completed.some((c) => c.in!.id === p.id))
      .sort((a, b) => b.total_points - a.total_points || b.now_cost - a.now_cost)
      .slice(0, 60);
  }, [players, activeSlot, clubFilter, search, squad, completed]);

  const byPosition = (pos: Position) => squad.filter((s) => s.position === pos);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="In the bank" value={fmtMoney(check.bankAfter)} tone={check.bankAfter < 0 ? "bad" : undefined} />
          <Stat label="Free transfers" value={`${freeTransfers}`} />
          <Stat label="Transfers" value={`${check.transfersMade}`} />
          <Stat
            label="Points cost"
            value={check.pointsCost ? `-${check.pointsCost}` : "0"}
            tone={check.pointsCost ? "bad" : undefined}
          />
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-xs font-black uppercase tracking-wider text-mute">Your squad</h2>
            <span className="text-[11px] text-mute">
              {activeSlot
                ? `Now pick a ${activeSlot.out.position} from the list`
                : "Click a player to transfer them out"}
            </span>
          </div>

          <div className="space-y-3">
            {POSITIONS.map((pos) => (
              <div key={pos}>
                <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-mute">
                  {pos}
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {byPosition(pos).map((s) => {
                    const p = playerById.get(s.player_id);
                    const pair = pairs.find((x) => x.out.player_id === s.player_id);
                    const club = clubById.get(s.club_id);
                    return (
                      <button
                        key={s.player_id}
                        onClick={() => startTransfer(s)}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                          pair?.in
                            ? "border-accent/60 bg-accent/10"
                            : pair
                            ? "border-warn bg-warn/10"
                            : "border-transparent bg-panel2 hover:border-accent/50"
                        }`}
                      >
                        <span className="h-7 w-1.5 shrink-0 rounded-full" style={kitSwatchStyle(club)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-white">
                            {pair?.in ? (
                              <>
                                <span className="text-mute line-through">{p?.web_name}</span>{" "}
                                <span className="text-accent">{pair.in.web_name}</span>
                              </>
                            ) : (
                              p?.web_name ?? `#${s.player_id}`
                            )}
                          </span>
                          <span className="block truncate text-[10px] text-mute">
                            {club?.shortName} · sells for {fmtMoney(s.selling_price)}
                          </span>
                        </span>
                        {pair && (
                          <span
                            onClick={(e) => { e.stopPropagation(); undo(s.player_id); }}
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-mute hover:text-bad"
                          >
                            undo
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel p-3">
          <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-mute">Chips</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHIP_INFO.map((c) => {
              const used = chipsUsed.includes(c.name);
              const active = chip === c.name;
              return (
                <button
                  key={c.name}
                  disabled={used}
                  onClick={() => setChip(active ? null : c.name)}
                  className={`rounded-lg border p-2 text-left transition disabled:opacity-40 ${
                    active ? "border-accent bg-accent/10" : "border-line bg-panel2 hover:border-accent/50"
                  }`}
                >
                  <div className="text-sm font-black text-white">
                    {c.label} {used && <span className="text-[10px] font-normal text-mute">used</span>}
                  </div>
                  <div className="text-[10px] leading-tight text-mute">{c.blurb}</div>
                </button>
              );
            })}
          </div>
          {chip && (
            <p className="mt-2 text-[11px] text-accent">
              {chip === "wildcard" ? "Wildcard" : "Free Hit"} active. Transfers this gameweek are free.
            </p>
          )}
        </div>

        {check.errors.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
            {check.errors.map((e, i) => <li key={i}>- {e}</li>)}
          </ul>
        )}

        {msg && (
          <p className={`rounded-lg border p-3 text-sm ${
            msg.ok ? "border-accent/40 bg-accent/10 text-accent" : "border-bad/40 bg-bad/10 text-bad"
          }`}>
            {msg.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={reset} disabled={pairs.length === 0 && !chip}
            className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-mute hover:text-white disabled:opacity-40">
            Reset
          </button>
          <button
            onClick={confirm}
            disabled={busy || completed.length === 0 || !check.ok}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-mute"
          >
            {busy
              ? "Confirming"
              : completed.length === 0
              ? "Make a transfer"
              : check.pointsCost
              ? `Confirm for -${check.pointsCost} pts`
              : `Confirm ${completed.length} transfer${completed.length === 1 ? "" : "s"}`}
          </button>
        </div>
        <p className="text-[11px] text-mute">
          Transfers apply to Gameweek {gameweek}. You get {RULES.freeTransfersPerGw} free transfer a
          week, stored up to {RULES.maxStoredFreeTransfers}. Extras cost {RULES.transferHitCost} points each.
        </p>
      </section>

      <aside className="rounded-xl border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-mute">
            {activeSlot ? `${activeSlot.out.position}s available` : "Player list"}
          </h2>
          {activeSlot && (
            <span className="text-[11px] font-bold text-accent">{fmtMoney(spendable)} to spend</span>
          )}
        </div>

        {!activeSlot && (
          <p className="mb-2 rounded-md border border-line bg-panel2 p-2 text-[11px] text-mute">
            Pick someone to transfer out first, then this list narrows to players who can replace them.
          </p>
        )}

        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players"
          className="mb-2 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent"
        />
        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
          className="mb-2 w-full rounded-lg border border-line bg-ink px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="ALL">All clubs</option>
          {CLUBS.map((c, i) => <option key={c.code} value={i + 1}>{c.shortName}</option>)}
        </select>

        <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
          {filtered.map((p) => {
            const reason = blockedReason(
              { id: p.id, position: p.position, club_id: p.club_id, now_cost: p.now_cost },
              activeSlot?.out ?? null,
              squad,
              check.bankAfter
            );
            const club = clubById.get(p.club_id);
            return (
              <button
                key={p.id}
                onClick={() => pickReplacement(p)}
                disabled={!!reason}
                title={reason ?? "Bring in"}
                className="flex w-full items-center gap-2 rounded-lg border border-transparent bg-panel2 px-2 py-1.5 text-left transition enabled:hover:border-accent/60 disabled:opacity-40"
              >
                <span className="h-7 w-1.5 shrink-0 rounded-full" style={kitSwatchStyle(club)} />
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
                    {reason ? ` · ${reason}` : ""}
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
            <p className="py-6 text-center text-xs text-mute">No players match.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2 py-2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`text-base font-black ${tone === "bad" ? "text-bad" : "text-white"}`}>{value}</div>
    </div>
  );
}
