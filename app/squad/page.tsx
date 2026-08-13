import Link from "next/link";
import SquadBuilder, { SavedPick } from "@/components/SquadBuilder";
import { DEMO_PLAYERS } from "@/data/demo-players";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import { Player } from "@/lib/types";
import { fmtMoney } from "@/lib/rules";
import { upcomingGameweek, deadlinePassed } from "@/lib/gameweek";

export const dynamic = "force-dynamic";

export default async function SquadPage() {
  if (!hasSupabase()) {
    return <Shell demo><SquadBuilder players={DEMO_PLAYERS} demo /></Shell>;
  }

  const supabase = await createClient();

  const { data: players } = await supabase
    .from("players").select("*")
    .order("total_points", { ascending: false })
    .order("now_cost", { ascending: false });

  if (!players?.length) {
    return <Shell demo><SquadBuilder players={DEMO_PLAYERS} demo /></Shell>;
  }

  const { data: { user } } = await supabase.auth.getUser();

  // Which gameweek are we picking for, and do we already have a squad?
  const { data: gws } = await supabase
    .from("gameweeks").select("id, deadline_time, is_next").order("id");
  const target = upcomingGameweek(gws as any);
  const locked = deadlinePassed(target);

  let picks: SavedPick[] = [];
  let teamName = "";
  let deadline: string | null = target?.deadline_time ?? null;

  if (user && target) {
    const [{ data: entry }, { data: saved }] = await Promise.all([
      supabase.from("entries").select("team_name").eq("id", user.id).maybeSingle(),
      supabase.from("entry_picks")
        .select("player_id, slot, is_captain, is_vice_captain")
        .eq("entry_id", user.id).eq("gameweek_id", target.id).order("slot"),
    ]);
    teamName = entry?.team_name ?? "";
    picks = (saved ?? []) as SavedPick[];
  }

  return (
    <Shell
      gameweek={target?.id ?? null}
      deadline={deadline}
      signedIn={!!user}
      hasSquad={picks.length > 0}
      locked={locked}
    >
      <SquadBuilder
        players={players as Player[]}
        signedIn={!!user}
        locked={locked}
        initialPicks={picks}
        initialTeamName={teamName}
        gameweek={target?.id ?? null}
      />
    </Shell>
  );
}

function Shell({
  children, demo, gameweek, deadline, signedIn, hasSquad, locked,
}: {
  children: React.ReactNode; demo?: boolean; gameweek?: number | null;
  deadline?: string | null; signedIn?: boolean; hasSquad?: boolean; locked?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">My Team</h1>
          <p className="text-sm text-mute">
            Fifteen players, {fmtMoney(1000)}, no more than three from any one club.
          </p>
        </div>
        {gameweek && (
          <div className="text-right">
            <div className="text-xs font-black uppercase tracking-wider text-mute">
              Gameweek {gameweek}
            </div>
            {deadline && (
              <div className="text-xs text-mute">
                Deadline {new Date(deadline).toLocaleString("en-GB", {
                  weekday: "short", day: "numeric", month: "short",
                  hour: "2-digit", minute: "2-digit",
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {!demo && !signedIn && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          You can build a squad without signing in, but you will need an account to save it.{" "}
          <Link href="/login?next=%2Fsquad" className="font-bold underline">Sign in</Link>
        </p>
      )}

      {locked && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          The deadline for this gameweek has passed, so your team is locked. Changes will be
          possible again once the next gameweek opens.
        </p>
      )}

      {hasSquad && !locked && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
          Loaded your saved squad. Any changes overwrite it when you save.
        </p>
      )}

      {children}
    </div>
  );
}
