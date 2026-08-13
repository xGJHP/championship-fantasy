/**
 * Sanity check your .env.local before you run anything else.
 *   npm run check-env
 */
import "./_env";

type Check = { key: string; required: boolean; test?: (v: string) => string | null };

const CHECKS: Check[] = [
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    required: true,
    test: (v) =>
      /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(v)
        ? null
        : "should look like https://yourproject.supabase.co",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    test: (v) =>
      v.startsWith("sb_publishable_") || v.startsWith("eyJ")
        ? null
        : "should start with sb_publishable_ or eyJ",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    required: true,
    test: (v) => {
      if (v.startsWith("sb_publishable_")) return "this is the PUBLISHABLE key, you need the SECRET one";
      return v.startsWith("sb_secret_") || v.startsWith("eyJ")
        ? null
        : "should start with sb_secret_ or eyJ";
    },
  },
  {
    key: "FOOTBALL_DATA_TOKEN",
    required: false,
    test: (v) => (/^[a-f0-9]{32}$/i.test(v) ? null : "usually a 32 character hex string"),
  },
  { key: "ADMIN_EMAILS", required: false },
  { key: "CRON_SECRET", required: false },
];

let failed = false;
console.log(`\nReading env from ${process.cwd()}\n`);

for (const c of CHECKS) {
  const raw = process.env[c.key];
  const v = raw?.trim();

  if (!v || v.startsWith("PASTE_")) {
    if (c.required) { console.log(`  FAIL  ${c.key} is missing`); failed = true; }
    else console.log(`  skip  ${c.key} not set (optional for now)`);
    continue;
  }
  if (raw !== v) console.log(`  warn  ${c.key} has stray spaces, trim it`);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    console.log(`  FAIL  ${c.key} is wrapped in quotes, remove them`);
    failed = true;
    continue;
  }

  const problem = c.test?.(v);
  if (problem) { console.log(`  FAIL  ${c.key} ${problem}`); failed = true; }
  else console.log(`  ok    ${c.key} ${mask(v)}`);
}

if (failed) {
  console.log("\nFix the FAIL lines in .env.local, then run this again.\n");
  process.exit(1);
}

console.log("\nEnvironment looks good. Testing the Supabase connection...\n");

(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { count, error } = await db.from("clubs").select("*", { count: "exact", head: true });

  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message)) {
      console.log("  Connected, but the tables are missing.");
      console.log("  Open the Supabase SQL editor and run supabase/schema.sql.\n");
    } else {
      console.log(`  Connection failed: ${error.message}\n`);
    }
    process.exit(1);
  }

  console.log(`  Connected. clubs table has ${count ?? 0} rows.`);
  if (!count) console.log("  Next: npx tsx scripts/seed-clubs.ts");
  console.log("");
})();

function mask(v: string) {
  return v.length <= 16 ? "*".repeat(v.length) : `${v.slice(0, 12)}...${v.slice(-4)}`;
}
