/**
 * The database schema, as the SQL in this repo defines it.
 *
 * Built so TypeScript queries can be compared against it. The defect that
 * motivated this shipped for months and passed 84 suites: lib/actions.ts
 * upserted on (org_id, quote_no) while the migration had created that index
 * as partial, so every quote save failed in production with a raw Postgres
 * string. Both files were correct on their own terms. Nothing compared them.
 *
 * Every suite in this repo reads source. A mismatch between two sources is
 * invisible to all of them, which makes it the most valuable thing left to
 * check automatically.
 */

import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

export function sqlFiles() {
  const out = [];
  for (const d of ["supabase", "supabase/migrations"]) {
    for (const f of readdirSync(new URL(d + "/", ROOT))) {
      if (f.endsWith(".sql")) out.push(`${d}/${f}`);
    }
  }
  return out.sort();
}

/**
 * Read every SQL file and accumulate what exists.
 *
 * DELIBERATELY GENEROUS. A schema model that misses a real column turns this
 * check into a generator of false alarms, and a check that cries wolf is
 * worse than no check — the next real failure gets waved through with the
 * noise. So every way a column can come into existence is collected, and
 * anything ambiguous is treated as existing.
 */
export function loadSchema() {
  const tables = new Map();   // table -> Set(columns)
  const views = new Set();
  const functions = new Set();
  const enums = new Set();
  const dynamicColumns = new Set();

  const add = (t, c) => {
    const k = t.toLowerCase();
    if (!tables.has(k)) tables.set(k, new Set());
    if (c) tables.get(k).add(c.toLowerCase());
  };

  for (const f of sqlFiles()) {
    const sql = readFileSync(new URL(f, ROOT), "utf8");

    /* CREATE TABLE … ( … ) */
    for (const m of sql.matchAll(/create table(?:\s+if not exists)?\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi)) {
      const t = m[1];
      add(t, null);
      for (const line of m[2].split("\n")) {
        if (/^\s*(primary|unique|constraint|foreign|check|exclude)\b/i.test(line)) continue;
        const c = line.match(/^\s*"?([a-z0-9_]+)"?\s+[a-z]/i);
        if (c) add(t, c[1]);
      }
    }

    /* ALTER TABLE … ADD COLUMN … (the commonest way a column appears later) */
    for (const m of sql.matchAll(/alter table\s+(?:if exists\s+)?(?:public\.)?([a-z0-9_]+)\s+add column(?:\s+if not exists)?\s+"?([a-z0-9_]+)"?/gi)) {
      add(m[1], m[2]);
    }
    /* ALTER TABLE … RENAME COLUMN a TO b — the new name exists. */
    for (const m of sql.matchAll(/alter table\s+(?:if exists\s+)?(?:public\.)?([a-z0-9_]+)\s+rename column\s+"?([a-z0-9_]+)"?\s+to\s+"?([a-z0-9_]+)"?/gi)) {
      add(m[1], m[3]);
    }

    /*
      DYNAMIC ALTERs, e.g. 2026_demo_isolation.sql:

        execute format('alter table %I add column if not exists is_demo ...', t)

      applied in a loop over a list of tables. The column genuinely exists on
      every table the loop touches, and working out which ones means
      interpreting PL/pgSQL. So the column name goes on a global allowlist
      instead: it is accepted on any table.

      Deliberately generous. My first pass flagged is_demo on three tables as
      a missing column — it is added by exactly this construct, and reporting
      a real column as missing is how a checker teaches people to ignore it.
    */
    for (const m of sql.matchAll(/execute\s+format\s*\(\s*'alter table[^']*add column(?:\s+if not exists)?\s+([a-z0-9_]+)/gi)) {
      dynamicColumns.add(m[1].toLowerCase());
    }

    for (const m of sql.matchAll(/create (?:or replace )?(?:materialized )?view\s+(?:if not exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)) {
      views.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/create (?:or replace )?function\s+(?:public\.)?([a-z0-9_]+)/gi)) {
      functions.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(/create type\s+(?:public\.)?([a-z0-9_]+)\s+as enum/gi)) {
      enums.add(m[1].toLowerCase());
    }
  }

  return { tables, views, functions, enums, dynamicColumns };
}

/** Every .ts/.tsx under src. */
export function tsFiles(dir = "src") {
  const out = [];
  for (const e of readdirSync(new URL(dir + "/", ROOT), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...tsFiles(`${dir}/${e.name}`));
    else if (/\.tsx?$/.test(e.name)) out.push(`${dir}/${e.name}`);
  }
  return out;
}

export function readSrc(f) {
  return readFileSync(new URL(f, ROOT), "utf8");
}

/** Comments are prose about the code, not the code. */
export function strip(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
