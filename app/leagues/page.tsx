import Link from "next/link";
import LeagueHub, { MyLeague } from "@/components/LeagueHub";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import { normaliseCode } from "@/lib/league-code";

export const dynamic = "force-dynamic";

export default async function LeaguesPage({
  searchParams,
}: { searchParams: Promise<{ join?: string }> }) {
  const { join } = await searchParams;

  if (!hasSupabase()) return <Notice title="Supabase is not configured">
    Add your keys to <code>.env.local</code> and restart the dev server.
  </Notice>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return <Notice title="Sign in to play in a league"
    cta={{ href: `/login?next=${encodeURIComponent(join ? `/leagues?join=${join}` : "/leagues")}`, label: "Sign in" }}>
    Leagues need an account so we know which squad is yours.
  </Notice>;

  const { data: entry } = await supabase
    .from("entries").select("id, total_points, gameweek_points").eq("id", user.id).maybeSingle();

  // Which leagues am I in?
  const { data: memberships } = await supabase
    .from("league_members").select("league_id").eq("entry_id", user.id);
  const ids = (memberships ?? []).map((m: any) => m.league_id);

  let leagues: MyLeague[] = [];
  if (ids.length) {
    const { data: rows } = await supabase
      .from("leagues").select("id, name, code, created_by").in("id", ids);
    const { data: allMembers } = await supabase
      .from("league_members").select("league_id, entry_id").in("league_id", ids);
    const { data: entries } = await supabase.from("entries").select("id, total_points");

    const pointsById = new Map((entries ?? []).map((e: any) => [e.id, e.total_points]));

    leagues = (rows ?? []).map((l: any) => {
      const members = (allMembers ?? []).filter((m: any) => m.league_id === l.id);
      const ranked = members
        .map((m: any) => ({ id: m.entry_id, pts: pointsById.get(m.entry_id) ?? 0 }))
        .sort((a, b) => b.pts - a.pts);
      const rank = ranked.findIndex((r) => r.id === user.id);
      return {
        id: l.id, name: l.name, code: l.code,
        members: members.length,
        rank: rank >= 0 ? rank + 1 : null,
        isOwner: l.created_by === user.id,
      };
    }).sort((a, b) => b.members - a.members);
  }

  // Overall standing
  const { data: standings } = await supabase
    .from("entries").select("id, total_points").order("total_points", { ascending: false });
  const overallRank = (standings ?? []).findIndex((e: any) => e.id === user.id) + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Leagues</h1>
        <p className="text-sm text-mute">Beating strangers is fine. Beating your mates is the point.</p>
      </div>

      {entry && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Total points" value={`${entry.total_points}`} />
          <Stat label="This gameweek" value={`${entry.gameweek_points}`} />
          <Stat label="Overall rank" value={overallRank ? `${overallRank} of ${standings?.length ?? 0}` : "-"} />
        </div>
      )}

      <LeagueHub
        leagues={leagues}
        prefillCode={join ? normaliseCode(join) : undefined}
        canPlay={!!entry}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className="text-base font-black text-white">{value}</div>
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
