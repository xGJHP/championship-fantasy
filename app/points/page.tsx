import Link from "next/link";
import { hasSupabase, createClient } from "@/lib/supabase/server";
import { buildGameweekView } from "@/lib/points";
import { Position, ChipName, Pick } from "@/lib/types";
import PointsView, { PlayerMeta } from "@/components/PointsView";
import GameweekPicker from "@/components/GameweekPicker";

export const dynamic = "force-dynamic";

const CHIP_LABEL: Record<ChipName, string> = {
  wildcard: "Wildcard", freehit: "Free Hit", bboost: "Bench Boost", "3xc": "Triple Captain",
};

export default async function PointsPage({
  searchParams,
}: { searchParams: Promise<{ gw?: string }> }) {
  const { gw } = await searchParams;

  if (!hasSupabase()) return <Notice title="Supabase is not configured">
    Add your keys to <code>.env.local</code> and restart the dev server.
  </Notice>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Notice title="Sign in to see your points"
    cta={{ href: "/login?next=%2Fpoints", label: "Sign in" }}>
    Points are per manager, so we need to know whose team to score.
  </Notice>;

  const { data: gameweeks } = await supabase
    .from("gameweeks").select("id, name, finished, average_score, highest_score, deadline_time").order("id");
  if (!gameweeks?.length) return <Notice title="No gameweeks yet">
    Run <code>npm run sync:fixtures</code> to pull the fixture list in.
  </Notice>;

  // Which gameweeks does this manager actually have a squad for?
  const { data: myGws } = await supabase
    .from("entry_picks").select("gameweek_id").eq("entry_id", user.id);
  const played = [...new Set((myGws ?? []).map((r: any) => r.gameweek_id))].sort((a, b) => a - b);
  if (played.length === 0) return <Notice title="No squad yet"
    cta={{ href: "/squad", label: "Build your squad" }}>
    Pick a team and your points will show up here once the gameweek is scored.
  </Notice>;

  const requested = gw ? Number(gw) : NaN;
  const current = played.includes(requested) ? requested : played[played.length - 1];
  const idx = played.indexOf(current);
  const meta = gameweeks.find((g: any) => g.id === current);

  const [{ data: picks }, { data: stats }, { data: chips }, { data: hist }] = await Promise.all([
    supabase.from("entry_picks")
      .select("player_id, slot, is_captain, is_vice_captain")
      .eq("entry_id", user.id).eq("gameweek_id", current).order("slot"),
    supabase.from("player_stats").select("*").eq("gameweek_id", current),
    supabase.from("chips_played").select("name").eq("entry_id", user.id).eq("gameweek_id", current),
    supabase.from("entry_history").select("*").eq("entry_id", user.id).order("gameweek_id"),
  ]);

  const squadIds = (picks ?? []).map((p: any) => p.player_id);
  const { data: players } = squadIds.length
    ? await supabase.from("players").select("id, web_name, club_id, position").in("id", squadIds)
    : { data: [] as any[] };

  const positions = new Map<number, Position>(
    (players ?? []).map((p: any) => [p.id, p.position as Position])
  );
  const playerMeta: Record<number, PlayerMeta> = {};
  (players ?? []).forEach((p: any) => {
    playerMeta[p.id] = { id: p.id, web_name: p.web_name, club_id: p.club_id };
  });

  const myStats = (stats ?? []).filter((s: any) => squadIds.includes(s.player_id));
  const bonus = new Map<number, number>();
  myStats.forEach((s: any) => bonus.set(s.player_id, (bonus.get(s.player_id) ?? 0) + (s.bonus ?? 0)));

  const thisGwHistory = (hist ?? []).find((h: any) => h.gameweek_id === current);

  const view = buildGameweekView({
    picks: (picks ?? []) as Pick[],
    positions,
    stats: myStats.map((s: any) => ({ ...s, bonus: 0 })),
    bonus,
    chip: (chips?.[0]?.name as ChipName) ?? null,
    transfersMade: thisGwHistory?.transfers_made ?? 0,
    freeTransfers: 1,
  });

  const scored = myStats.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Points</h1>
          <p className="text-sm text-mute">{meta?.name ?? `Gameweek ${current}`}</p>
        </div>
        <div className="flex items-center gap-1">
          <NavLink gw={played[idx - 1]} label="Previous" />
          <GameweekPicker gameweeks={played} current={current} />
          <NavLink gw={played[idx + 1]} label="Next" />
        </div>
      </div>

      {!scored && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
          This gameweek has not been scored yet. Enter the match stats in{" "}
          <Link href="/admin" className="font-bold underline">admin</Link>, then run{" "}
          <code className="rounded bg-ink px-1 text-accent">npm run process:gw {current}</code>.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Gameweek points" value={`${view.total}`} big />
        <Stat label="On the bench" value={`${view.benchPoints}`} />
        <Stat
          label="Transfer cost"
          value={view.transferCost ? `-${view.transferCost}` : "0"}
          tone={view.transferCost ? "bad" : undefined}
        />
        <Stat label="Average" value={`${meta?.average_score ?? 0}`} />
      </div>

      {view.chip && (
        <p className="rounded-lg border border-accent/40 bg-accent/10 p-2 text-center text-sm font-bold text-accent">
          {CHIP_LABEL[view.chip]} played
        </p>
      )}

      <PointsView
        starters={view.starters}
        bench={view.bench}
        meta={playerMeta}
        autoSubCount={view.autoSubs.length}
      />

      {(hist ?? []).length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-mute">Season</h2>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-panel2 text-left text-[11px] uppercase tracking-wider text-mute">
                <tr>
                  <th className="px-3 py-2">GW</th>
                  <th className="px-2 py-2 text-right">Points</th>
                  <th className="px-2 py-2 text-right">Bench</th>
                  <th className="px-2 py-2 text-right">Hits</th>
                  <th className="px-2 py-2">Chip</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(hist ?? []).map((h: any, i: number) => (
                  <tr key={h.gameweek_id}
                    className={`${i % 2 ? "bg-panel" : "bg-ink"} ${h.gameweek_id === current ? "ring-1 ring-inset ring-accent/50" : ""}`}>
                    <td className="px-3 py-1.5">
                      <Link href={`/points?gw=${h.gameweek_id}`} className="font-bold hover:text-accent">
                        {h.gameweek_id}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-right font-black text-white">{h.points}</td>
                    <td className="px-2 py-1.5 text-right text-mute">{h.points_on_bench}</td>
                    <td className="px-2 py-1.5 text-right text-mute">
                      {h.transfer_cost ? `-${h.transfer_cost}` : "0"}
                    </td>
                    <td className="px-2 py-1.5 text-[11px] text-mute">
                      {h.chip ? CHIP_LABEL[h.chip as ChipName] : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right font-black text-accent">{h.total_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ gw, label }: { gw: number | undefined; label: string }) {
  if (!gw) {
    return <span className="rounded-lg border border-line px-3 py-2 text-sm text-line">{label}</span>;
  }
  return (
    <Link href={`/points?gw=${gw}`}
      className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-mute hover:text-white">
      {label}
    </Link>
  );
}

function Stat({ label, value, tone, big }: {
  label: string; value: string; tone?: "bad"; big?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel px-2 py-2 text-center">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">{label}</div>
      <div className={`font-black ${big ? "text-2xl" : "text-base"} ${tone === "bad" ? "text-bad" : "text-white"}`}>
        {value}
      </div>
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
