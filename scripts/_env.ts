/**
 * Load environment variables for standalone scripts.
 *
 * Next.js reads .env.local automatically, but dotenv does not: it looks for
 * .env only. This loads .env.local first, then falls back to .env, so the
 * scripts see exactly the same variables the web app does.
 *
 * Import this FIRST in any script that needs env vars.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: false });
}
