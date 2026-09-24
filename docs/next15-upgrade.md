# Next 14 → 15: what is left

*The wide part is already done (commit `9619dc5`, on Next 14). This is the
remainder, which is small. Written to be executed in one sitting.*

---

## Why bother, honestly

Next 14.2.35 is the last release on the 14 line. It is out of support, so the
next advisory will have no patch at all — that is the real reason to move, more
than any advisory open today.

**Correcting an earlier overstatement of mine.** Of the six advisories against
14.2.35, five do not apply to this deployment:

| Advisory | Applies? | Why |
|---|---|---|
| GHSA-2xp9-vwfh-vxw4 — AVIF RCE (critical) | **No** | Only reachable when a site opts into `image/avif` via `images.formats`. `next.config.mjs` sets `remotePatterns` only and never has. |
| GHSA-p293-qw3h-jr36 — Windows RCE | No | Vercel runs Linux. |
| GHSA-p9j2-gv94-2wf4 — SSRF in rewrites | No | No `rewrites` in `next.config.mjs`. |
| GHSA-4c39-4ccg-62r3 — Edge payload | No | Every route is `runtime = "nodejs"`. |
| GHSA-4633-3j49-mh5q — cache confusion | Marginal | Needs invalid-UTF-8 bodies against a cached route. |
| **GHSA-955p-x3mx-jcvp — Server Function endpoint disclosure** | **Yes** | Server actions are used throughout. Information disclosure, not RCE. |

So: a should-do, not a drop-everything. Do it deliberately, not in a panic.

**Target 15.5.25, not 16.** The patches landed in 15.5.24, so 15 is sufficient
and is one major rather than two. 16 can wait for a quiet week.

---

## What is already done

`createClient()` in `lib/supabase/server.ts` is async and awaits `cookies()`,
and all 123 call sites across 34 files await it. That works identically on 14
and 15 — `await` on a non-Promise is a no-op — so it is already deployed and
already proven in production.

That was ~90% of the mechanical work. What follows is roughly 15 edits.

---

## Step 1 — install

```bash
npm install next@15.5.25 react@19 react-dom@19
npm install -D @types/react@19 @types/react-dom@19 @types/node@22
```

Expect peer-dependency warnings from `next-themes@0.3` (0.4.6 adds React 19),
and possibly `recharts@2.15` and `framer-motion@11`. Warnings are fine to start
with; only fix one if something actually breaks. If `next-themes` misbehaves,
`npm install next-themes@0.4.6` is the fix.

## Step 2 — run the official codemod

```bash
npx @next/codemod@latest next-async-request-api .
```

This handles `params` and `searchParams`. Review its diff rather than trusting
it — it is good but it does sometimes wrap things that were already awaited.

## Step 3 — let the compiler find the rest

```bash
npx tsc --noEmit
```

This is the whole verification strategy for this migration, and it is a good
one: every remaining break is a Promise being used as a value, which is a type
error by construction. Work the list to zero.

The files it will name, if the codemod missed them:

**`params` — nine sites, all dynamic segments**

```
src/app/resources/[slug]/page.tsx      generateMetadata + default export
src/app/industries/[slug]/page.tsx     generateMetadata + default export
src/app/deadlines/[slug]/page.tsx      generateMetadata + default export
src/app/r/[token]/page.tsx             default export
src/app/api/t/o/[token]/route.ts       GET
src/app/api/t/c/[token]/route.ts       GET
```

The shape in each case:

```ts
// before
export default function IndustryPage({ params }: { params: { slug: string } }) {
  const ind = bySlug(params.slug);

// after
export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ind = bySlug(slug);
```

Note the three `generateMetadata` functions must become `async` too.

**`searchParams` — two pages**

```
src/app/(app)/import/page.tsx    searchParams?: { table?: string }
src/app/(app)/data/page.tsx      searchParams: { table?, q?, page? }
```

Same treatment. `src/app/login/page.tsx` also matches a grep for
`searchParams`, but that is `new URL(...).searchParams` — a browser URL object,
unrelated, leave it alone.

**`headers()` — two sites.** Same as cookies: `await headers()`.

## Step 4 — build, and read the output

```bash
npm run build
```

This is the step that cannot be skipped, and the step I could not run for you —
the sandbox has 4 cores, 3GB of RAM and a filesystem 11× slower than local
disk, and the build has never completed there. Two deploys have already broken
on errors only the build reveals, both of which now have a test
(`test:routes`, `test:boundaries`) — but a framework major will find new ones.

Watch for:

- **`export const dynamic` colliding with `next/dynamic`** in any file that
  imports both. `dashboard/page.tsx` already hit this; see
  `components/charts/trend-chart-lazy.tsx` for the pattern that avoids it.
- **`ssr: false` inside a Server Component** — illegal. Same fix: a small
  `"use client"` wrapper.
- Route files exporting anything that is not a handler or a config field.

## Step 5 — the suites

```bash
npm test
```

73 suites. They do not know about Next versions, so any failure is a real
behavioural change, not a framework artefact.

## Step 6 — deploy to a preview, not to production

Vercel gives every branch a preview URL. Walk it: sign in, import a CSV,
open `/dashboard`, `/receivables`, `/collections`, a `/industries/[slug]` page
and a `/deadlines/[slug]` page. The dynamic-segment pages are where a missed
`await params` shows up, and it shows up as a page that renders `[object
Promise]` rather than as an error.

---

## Rollback

`git revert` the upgrade commit and redeploy. There is no database change and
no migration in any of this, so a revert is complete — nothing to undo on the
Supabase side.

---

## Afterwards

Once on 15, these become worth a look, in this order:

1. `@supabase/ssr` 0.5.2 → 0.12.x. It has Next 15 cookie handling and is seven
   minors behind.
2. `recharts` 2 → 3 (npm already warns 2.x is unmaintained), `framer-motion`
   11 → 13, `tailwind-merge` 2 → 3, `next-themes` 0.3 → 0.4.
3. Next 16, when there is no other pressure on the week.

Do not do these in the same commit as the upgrade. The whole reason this one is
tractable is that the wide mechanical change was separated from the risky one.
