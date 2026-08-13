import { createClient } from "@/lib/supabase/server";
import { checkAdmin } from "@/lib/admin";
import AdminGate from "@/components/AdminGate";
import PriceEditor from "@/components/PriceEditor";
import AddPlayerForm from "@/components/AddPlayerForm";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const check = await checkAdmin();
  if (!check.ok) return <AdminGate check={check} next="/admin/prices" />;

  const supabase = await createClient();
  const [{ data: players }, { data: clubs }] = await Promise.all([
    supabase.from("players").select("id, club_id, web_name, position, now_cost, start_cost, status")
      .order("now_cost", { ascending: false }),
    supabase.from("clubs").select("id, short_name, primary_colour").order("short_name"),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Players</h1>
          <p className="text-sm text-mute">
            {(players ?? []).length} players. Prices move in 0.5m steps and save straight to the
            database.
          </p>
        </div>
      </div>

      <AddPlayerForm clubs={clubs ?? []} />
      <PriceEditor players={players ?? []} clubs={clubs ?? []} />
    </div>
  );
}
