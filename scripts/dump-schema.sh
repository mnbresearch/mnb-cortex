#!/usr/bin/env bash
#
# Dump the LIVE database schema and compare it with what this repo says.
#
#   npm run dump:schema
#
# WHY — AND A CORRECTION
#
# An earlier version of this script claimed the repo had no schema for most
# tables and that backups were therefore unrestorable. That was wrong. It came
# from grepping only supabase/migrations/ and missing supabase/schema.sql plus
# eleven supabase/migration_*.sql files — 28 SQL files in total. All 47 backed-up
# tables do have a CREATE TABLE in this repo, and `npm run rehearse:restore`
# now builds 52 tables from source and restores real rows into them.
#
# So the schema is not missing. The open question is whether it has DRIFTED.
# The live database has been edited by hand through the Supabase dashboard, and
# a column added there but never written back here would not show up until the
# day you tried to restore into a table that was subtly the wrong shape. This
# script exists to catch that, and should be run after any dashboard change.
#
# Known gaps this will also reveal, both currently real:
#   - user_org_ids() is referenced by the RLS policies in supabase/*.sql but is
#     defined nowhere in the repo. It exists only in the live database.
#   - supabase/migrations/2026_tenancy.sql depends on auth.jwt().
#
# ---------------------------------------------------------------------------
# CREDENTIALS: nothing is passed as an argument, because arguments end up in
# your shell history. The Supabase CLI prompts and stores its own session.
# ---------------------------------------------------------------------------

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-krklgsmeamnxeawdlmka}"
OUT="supabase/schema.live.sql"

cd "$(dirname "$0")/.."

echo "Dumping LIVE schema for ${PROJECT_REF} -> ${OUT}"
echo

command -v npx >/dev/null 2>&1 || { echo "npx not found. Install Node.js first." >&2; exit 1; }

if ! npx --yes supabase@latest projects list >/dev/null 2>&1; then
  echo "Not logged in to the Supabase CLI. Opening login…"
  npx --yes supabase@latest login
fi

if [ ! -f "supabase/.temp/project-ref" ]; then
  echo "Linking this directory to ${PROJECT_REF}…"
  npx --yes supabase@latest link --project-ref "${PROJECT_REF}"
fi

npx --yes supabase@latest db dump --schema public -f "${OUT}"

echo
echo "Wrote ${OUT} ($(wc -l < "${OUT}" | tr -d ' ') lines)."
echo

# Compare the set of tables live against the set this repo can build.
node - "$OUT" <<'NODE'
const fs = require("fs"), path = require("path");
const live = fs.readFileSync(process.argv[2], "utf8");

const tablesIn = (sql) => {
  const s = new Set();
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi)) {
    s.add(m[1].toLowerCase());
  }
  return s;
};

let repoSql = "";
for (const d of ["supabase", "supabase/migrations"]) {
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith(".sql") && f !== "schema.live.sql") repoSql += fs.readFileSync(path.join(d, f), "utf8") + "\n";
  }
}

const L = tablesIn(live), R = tablesIn(repoSql);
const onlyLive = [...L].filter((t) => !R.has(t)).sort();
const onlyRepo = [...R].filter((t) => !L.has(t)).sort();

console.log(`live tables: ${L.size}   repo tables: ${R.size}`);
console.log("");
if (onlyLive.length) {
  console.log("IN LIVE BUT NOT IN THE REPO — these would be missing after a rebuild:");
  for (const t of onlyLive) console.log("   " + t);
  console.log("");
}
if (onlyRepo.length) {
  console.log("IN THE REPO BUT NOT LIVE (dropped, renamed, or never applied):");
  for (const t of onlyRepo) console.log("   " + t);
  console.log("");
}
if (!onlyLive.length && !onlyRepo.length) console.log("No table-level drift. (Column-level drift still needs a read of the diff.)");
NODE

echo
echo "Review the diff, fold anything new into supabase/schema.sql, then:"
echo "    npm run rehearse:restore     # must still pass"
echo "    git add supabase/ && git commit -m 'chore(db): reconcile schema with live'"
