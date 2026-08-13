"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { POSITIONS, Position } from "@/lib/types";
import { isValidStartPrice } from "@/lib/pricing";

type Club = { id: number; short_name: string };

export default function AddPlayerForm({ clubs }: { clubs: Club[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clubId, setClubId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState<Position | "">("");
  const [price, setPrice] = useState("4.5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const tenths = Math.round(parseFloat(price) * 10);
  const priceOk = Number.isFinite(tenths) && isValidStartPrice(tenths) && tenths >= 40;
  const ready = clubId !== "" && name.trim() && position && priceOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ club_id: clubId, web_name: name.trim(), position, now_cost: tenths }),
    });
    const json = await res.json().catch(() => ({ message: "Something went wrong." }));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: `Added ${json.player.web_name}.` });
      setName("");
      router.refresh();
    } else {
      setMsg({ ok: false, text: json.message });
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-white hover:border-accent">
        Add a player
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-black">Add a player</h2>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }}
          className="text-xs font-bold text-mute hover:text-white">Close</button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto_auto]">
        <select value={clubId} onChange={(e) => setClubId(Number(e.target.value))}
          className="rounded-lg border border-line bg-ink px-2 py-2 text-sm outline-none focus:border-accent">
          <option value="">Club</option>
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}
        </select>

        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Surname as it should appear" maxLength={40}
          className="rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent" />

        <select value={position} onChange={(e) => setPosition(e.target.value as Position)}
          className="rounded-lg border border-line bg-ink px-2 py-2 text-sm outline-none focus:border-accent">
          <option value="">Pos</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <input type="number" step="0.5" min="4" value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={`w-24 rounded-lg border bg-ink px-2 py-2 text-center text-sm font-bold outline-none ${
            price && !priceOk ? "border-bad text-bad" : "border-line text-white focus:border-accent"
          }`} />

        <button type="submit" disabled={!ready || busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink disabled:opacity-40">
          {busy ? "Adding" : "Add"}
        </button>
      </div>

      {price && !priceOk && (
        <p className="mt-1 text-xs text-bad">Price must be a whole 0.5m step, 4.0m or more.</p>
      )}
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-accent" : "text-bad"}`}>{msg.text}</p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-mute">
        Use the name managers will recognise, usually just the surname. Wingers count as
        midfielders, as in FPL. The player appears in the squad builder straight away.
      </p>
    </form>
  );
}
