import Link from "next/link";
import { notFound } from "next/navigation";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import { displayCode } from "@/lib/league-code";
import { ordinal } from "@/components/LeagueHub";
import LeagueActions from "@/components/LeagueActions";

export const dynamic = "force-dynamic";

type Row = {
  entry_id: string; team_name: string; manager_name: string;
  total: number; gw: number; rank: number; lastRank: number | null; isMe: boolean;
};

export default async function LeagueTable({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leagueId = Number(id);
  if (!Number.isInteger(leagueId)) notFound();

  if (!hasSupabase()) return <Notice title="Supabase is not configured" />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues").select("id, name, code, created_by, start_gw").eq("id", leagueId).maybeSingle();
  if (!league) notFound();

  const { data: members } = await supabase
    .from("league_members").select("entry_id").eq("league_id", leagueId);
  const memberIds = (members ?? []).map((m: any) => m.entry_id);

  const { data: entries } = memberIds.length
    ? await supabase.from("entries")
        .select("id, team_name, manager_name, total_points, gameweek_points")
        .in("id", memberIds)
    : { data: [] as any[] };

  // Previous gameweek totals, so we can show movement
  const { data: gws } = await supabase
    .from("gameweeks").select("id, finished").eq("finished", true).order("id", { ascending: false }).limit(1);
  const lastFinished = gws?.[0]?.id ?? null;

  let priorTotals = new Map<string, number>();
  if (lastFinished && memberIds.length) {
    const { data: hist } = await supabase
      .from("entry_history").select("entry_id, total_points, points")
      .eq("gameweek_id", lastFinished).in("entry_id", memberIds);
    (hist ?? []).forEach((h: any) =>
      priorTotals.set(h.entry_id, (h.total_points ?? 0) - (h.points ?? 0))
    );
  }

  const sorted = [...(entries ?? [])].sort(
    (a: any, b: any) => b.total_points - a.total_points || a.team_name.localeCompare(b.team_name)
  );
  const priorOrder = [...(entries ?? [])]
    .sort((a: any, b: any) => (priorTotals.get(b.id) ?? 0) - (priorTotals.get(a.id) ?? 0))
    .map((e: any) => e.id);

  const rows: Row[] = sorted.map((e: any, i: number) => {
    const prev = priorOrder.indexOf(e.id);
    return {
      entry_id: e.id, team_name: e.team_name, manager_name: e.manager_name,
      total: e.total_points, gw: e.gameweek_points,
      rank: i + 1,
      lastRank: priorTotals.size ? prev + 1 : null,
      isMe: e.id === user?.id,
    };
  });

  const me = rows.find((r) => r.isMe);
  const isMember = !!me;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/leagues" className="text-xs font-bold text-mute hover:text-accent">
          Back to leagues
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{league.name}</h1>
            <p className="text-sm text-mute">
              {rows.length} {rows.length === 1 ? "manager" : "managers"}
              {me ? ` · you are ${ordinal(me.rank)}` : ""}
              {league.start_gw > 1 ? ` · from Gameweek ${league.start_gw}` : ""}
            </p>
          </div>
          <code className="rounded-md bg-panel px-3 py-2 text-sm font-black tracking-wider text-accent">
            {displayCode(league.code)}
          </code>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-panel p-8 text-center text-sm text-mute">
          Nobody has joined yet. Send that code around.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-mute">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-2 py-2 w-8"></th>
                <th className="px-2 py-2">Team</th>
                <th className="px-2 py-2 text-right">GW</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.entry_id}
                  className={`${i % 2 ? "bg-panel" : "bg-ink"} ${r.isMe ? "ring-1 ring-inset ring-accent/50" : ""}`}>
                  <td className="px-3 py-2 font-black text-mute">{r.rank}</td>
                  <td className="px-2 py-2">{movement(r)}</td>
                  <td className="px-2 py-2">
                    <div className={`truncate font-bold ${r.isMe ? "text-accent" : "text-white"}`}>
                      {r.team_name}
                    </div>
                    <div className="truncate text-[11px] text-mute">{r.manager_name}</div>
                  </td>
                  <td className="px-2 py-2 text-right text-mute">{r.gw}</td>
                  <td className="px-3 py-2 text-right font-black text-white">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isMember && user && (
        <LeagueActions
          leagueId={league.id}
          code={league.code}
          isOwner={league.created_by === user.id}
          memberCount={rows.length}
        />
      )}
    </div>
  );
}

function movement(r: Row) {
  if (r.lastRank === null || r.lastRank === 0) return <span className="text-mute">-</span>;
  const diff = r.lastRank - r.rank;
  if (diff === 0) return <span className="text-mute" title="No change">=</span>;
  return diff > 0
    ? <span className="font-black text-accent" title={`Up ${diff}`}>&#9650;</span>
    : <span className="font-black text-bad" title={`Down ${-diff}`}>&#9660;</span>;
}

function Notice({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-panel p-8 text-center">
      <h1 className="text-xl font-black">{title}</h1>
    </div>
  );
}
