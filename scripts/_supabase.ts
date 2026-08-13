import "./_env";
import { createClient } from "@supabase/supabase-js";

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("\nCould not read your Supabase keys.\n");
    console.error("  NEXT_PUBLIC_SUPABASE_URL   " + (url ? "found" : "MISSING"));
    console.error("  SUPABASE_SERVICE_ROLE_KEY  " + (key ? "found" : "MISSING"));
    console.error("\nChecked for .env.local and .env in:");
    console.error("  " + process.cwd());
    console.error("\nRun this from the fcs folder, not from a parent folder.\n");
    process.exit(1);
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
