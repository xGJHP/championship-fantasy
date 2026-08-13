"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { displayCode } from "@/lib/league-code";

export type MyLeague = {
  id: number; name: string; code: string; members: number;
  rank: number | null; isOwner: boolean;
};

export default function LeagueHub({
  leagues, prefillCode, canPlay,
}: { leagues: MyLeague[]; prefillCode?: string; canPlay: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState(prefillCode ?? "");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({ message: "Something went wrong." }));
    return { ok: res.ok, json };
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("create"); setMsg(null);
    const { ok, json } = await post("/api/leagues", { name: name.trim() });
    setBusy(null);
    if (ok) { setName(""); setMsg({ ok: true, text: `Created ${json.league.name}. Share the code below.` }); router.refresh(); }
    else setMsg({ ok: false, text: json.message });
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("join"); setMsg(null);
    const { ok, json } = await post("/api/leagues/join", { code });
    setBusy(null);
    if (ok) {
      setCode("");
      setMsg({ ok: true, text: json.alreadyIn ? `You are already in ${json.league.name}.` : `Joined ${json.league.name}.` });
      router.refresh();
    } else setMsg({ ok: false, text: json.message });
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* clipboard blocked, the text is on screen anyway */ }
  };

  const shareUrl = (c: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/leagues?join=${c}`;

  return (
    <div className="space-y-6">
      {!canPlay && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          Pick your squad before creating or joining a league.{" "}
          <Link href="/squad" className="font-bold underline">Build your squad</Link>
        </p>
      )}

      {msg && (
        <p className={`rounded-lg border p-3 text-sm ${
          msg.ok ? "border-accent/40 bg-accent/10 text-accent" : "border-bad/40 bg-bad/10 text-bad"
        }`}>{msg.text}</p>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <form onSubmit={create} className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-sm font-black">Start a league</h2>
          <p className="mt-1 text-xs text-mute">You get a code to send your mates.</p>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="The Office League" maxLength={60} disabled={!canPlay}
            className="mt-3 w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none placeholder:text-mute focus:border-accent disabled:opacity-40"
          />
          <button type="submit" disabled={!canPlay || busy !== null || !name.trim()}
            className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-black text-ink disabled:opacity-40">
            {busy === "create" ? "Creating" : "Create league"}
          </button>
        </form>

        <form onSubmit={join} className="rounded-xl border border-line bg-panel p-4">
          <h2 className="text-sm font-black">Join a league</h2>
          <p className="mt-1 text-xs text-mute">Paste the code you were sent.</p>
          <input
            value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="FCS-K7M2QX" disabled={!canPlay}
            className="mt-3 w-full rounded-lg border border-line bg-ink px-3 py-2 text-center text-sm font-black uppercase tracking-[0.2em] outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-mute focus:border-accent disabled:opacity-40"
          />
          <button type="submit" disabled={!canPlay || busy !== null || !code.trim()}
            className="mt-2 w-full rounded-lg bg-accent py-2 text-sm font-black text-ink disabled:opacity-40">
            {busy === "join" ? "Joining" : "Join league"}
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-mute">Your leagues</h2>
        {leagues.length === 0 ? (
          <p className="rounded-xl border border-line bg-panel p-6 text-center text-sm text-mute">
            No leagues yet. A game like this is not much fun on your own.
          </p>
        ) : (
          <div className="space-y-2">
            {leagues.map((l) => (
              <div key={l.id} className="rounded-xl border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/leagues/${l.id}`} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-white hover:text-accent">{l.name}</div>
                    <div className="text-[11px] text-mute">
                      {l.members} {l.members === 1 ? "manager" : "managers"}
                      {l.rank ? ` · you are ${ordinal(l.rank)}` : ""}
                      {l.isOwner ? " · you started it" : ""}
                    </div>
                  </Link>
                  <code className="rounded-md bg-ink px-2 py-1 text-xs font-black tracking-wider text-accent">
                    {displayCode(l.code)}
                  </code>
                  <button onClick={() => copy(displayCode(l.code), `c-${l.id}`)}
                    className="rounded-md border border-line px-2 py-1 text-[11px] font-bold text-mute hover:text-white">
                    {copied === `c-${l.id}` ? "Copied" : "Copy code"}
                  </button>
                  <button onClick={() => copy(shareUrl(l.code), `l-${l.id}`)}
                    className="rounded-md border border-line px-2 py-1 text-[11px] font-bold text-mute hover:text-white">
                    {copied === `l-${l.id}` ? "Copied" : "Copy link"}
                  </button>
                  <Link href={`/leagues/${l.id}`}
                    className="rounded-md bg-panel2 px-3 py-1.5 text-xs font-bold text-white hover:bg-line">
                    Table
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
