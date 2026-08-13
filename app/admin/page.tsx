import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/admin";
import AdminGate from "@/components/AdminGate";
import AdminStatEntry from "@/components/AdminStatEntry";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const check = await checkAdmin();
  if (!check.ok) return <AdminGate check={check} next="/admin" />;

  const supabase = await createClient();
  const [{ data: gameweeks }, { data: clubs }] = await Promise.all([
    supabase.from("gameweeks").select("*").order("id"),
    supabase.from("clubs").select("*").order("name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Admin</h1>
          <p className="text-sm text-mute">
            Enter per-player match stats. Goals conceded and clean sheets are derived from the
            scoreline when you process the gameweek.
          </p>
        </div>
        <Link href="/admin/prices"
          className="rounded-lg border border-line bg-panel px-3 py-2 text-sm font-bold text-white hover:border-accent">
          Edit player prices
        </Link>
      </div>
      <AdminStatEntry gameweeks={gameweeks ?? []} clubs={clubs ?? []} />
    </div>
  );
}
