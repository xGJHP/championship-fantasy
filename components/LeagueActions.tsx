"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { displayCode } from "@/lib/league-code";

export default function LeagueActions({
  leagueId, code, isOwner, memberCount,
}: { leagueId: number; code: string; isOwner: boolean; memberCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = () => {
    const url = `${window.location.origin}/leagues?join=${code}`;
    const text = `Join my Championship fantasy league. Code ${displayCode(code)}\n${url}`;
    navigator.clipboard.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {}
    );
  };

  const leave = async () => {
    setBusy(true); setError(null);
    const res = await fetch("/api/leagues/leave", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId }),
    });
    const json = await res.json().catch(() => ({ message: "Something went wrong." }));
    setBusy(false);
    if (res.ok) router.push("/leagues");
    else { setError(json.message); setConfirming(false); }
  };

  const soleOwner = isOwner && memberCount <= 1;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel p-3">
      <button onClick={invite}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-black text-ink hover:bg-accent2">
        {copied ? "Invite copied" : "Copy invite"}
      </button>
      <span className="text-[11px] text-mute">
        Copies the code and a join link, ready to paste into a group chat.
      </span>

      <div className="ml-auto flex items-center gap-2">
        {error && <span className="text-xs text-bad">{error}</span>}
        {confirming ? (
          <>
            <span className="text-xs text-mute">
              {soleOwner ? "Delete this league?" : "Sure?"}
            </span>
            <button onClick={leave} disabled={busy}
              className="rounded-lg bg-bad px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
              {busy ? "Working" : "Yes"}
            </button>
            <button onClick={() => setConfirming(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-mute">
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-mute hover:border-bad hover:text-bad">
            {soleOwner ? "Delete league" : "Leave league"}
          </button>
        )}
      </div>
    </div>
  );
}
