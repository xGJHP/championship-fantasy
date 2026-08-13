import Link from "next/link";
import TransferMarket from "@/components/TransferMarket";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import { Player, ChipName } from "@/lib/types";
import { SquadSlot } from "@/lib/transfers";
import { upcomingGameweek, deadlinePassed } from "@/lib/gameweek";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  if (!hasSupabase()) return <Notice title="Supabase is not configured">
    Add your keys to <code>.env.local</code> and restart the dev server.
  </Notice>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Notice title="Sign in to make transfers" cta={{ href: "/login?next=%2Ftransfers", label: "Sign in" }}>
    Transfers need an account, so we know whose squad to change.
  </Notice>;

  const { data: entry } = await supabase.from("entries").select("*").eq("id", user.id).maybeSingle();
  if (!entry) return <Notice title="Pick a squad first" cta={{ href: "/squad", label: "Build your squad" }}>
    You need a squad before you can transfer anyone out of it.
  </Notice>;

  const { data: gws } = await supabase
    .from("gameweeks").select("id, deadline_time, is_next, finished").order("id");
  const target = upcomingGameweek(gws as any);
  if (!target) return <Notice title="No gameweeks yet">
    Run <code>npm run sync:fixtures</code> to pull the fixture list in.
  </Notice>;

  if (deadlinePassed(target)) return <Notice title="Deadline passed">
    Gameweek {target.id} is locked. Transfers reopen once the next gameweek is set.
  </Notice>;

  // The squad for this gameweek, falling back to the most recent one
  let { data: picks } = await supabase
    .from("entry_picks").select("*").eq("entry_id", user.id).eq("gameweek_id", target.id).order("slot");
  if (!picks?.length) {
    const { data: prev } = await supabase
      .from("entry_picks").select("*")
      .eq("entry_id", user.id).lt("gameweek_id", target.id)
      .order("gameweek_id", { ascending: false }).order("slot");
    if (prev?.length) {
      const lastGw = prev[0].gameweek_id;
      picks = prev.filter((p: any) => p.gameweek_id === lastGw);
    }
  }
  if (!picks?.length) return <Notice title="Pick a squad first" cta={{ href: "/squad", label: "Build your squad" }}>
    We could not find a saved squad for you.
  </Notice>;

  const { data: players } = await supabase.from("players").select("*")
    .order("total_points", { ascending: false }).order("now_cost", { ascending: false });

  const byId = new Map((players ?? []).map((p: any) => [p.id, p]));
  const squad: SquadSlot[] = picks.map((p: any) => {
    const pl = byId.get(p.player_id);
    return {
      player_id: p.player_id,
      position: pl?.position ?? "MID",
      club_id: pl?.club_id ?? 0,
      purchase_price: p.purchase_price,
      selling_price: p.selling_price,
      slot: p.slot,
    };
  });

  const { data: chips } = await supabase.from("chips_played").select("name").eq("entry_id", user.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Transfers</h1>
          <p className="text-sm text-mute">
            Swap like for like. You sell at your selling price, not the current price.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-black uppercase tracking-wider text-mute">
            Gameweek {target.id}
          </div>
          <div className="text-xs text-mute">
            Deadline {new Date(target.deadline_time).toLocaleString("en-GB", {
              weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </div>
        </div>
      </div>

      <TransferMarket
        squad={squad}
        players={(players ?? []) as Player[]}
        bank={entry.bank}
        freeTransfers={entry.free_transfers}
        gameweek={target.id}
        chipsUsed={(chips ?? []).map((c: any) => c.name as ChipName)}
      />
    </div>
  );
}

function Notice({ title, children, cta }: {
  title: string; children: React.ReactNode; cta?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-panel p-8 text-center">
      <h1 className="text-xl font-black">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mute [&_code]:mx-1 [&_code]:rounded [&_code]:bg-ink [&_code]:px-1 [&_code]:text-accent">
        {children}
      </p>
      {cta && (
        <Link href={cta.href} className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-black text-ink">
          {cta.label}
        </Link>
      )}
    </div>
  );
}
