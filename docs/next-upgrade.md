# Next 14 → 16: what is left

*The wide part is already done (commit `9619dc5`, on Next 14). This is the
remainder. Re-verified 30 September 2026 against the live advisory list.*

---

## What changed since this document was first written

Three things, and each one changes the plan.

**1. The target is now 16, not 15.** This document used to say "target 15.5.25,
not 16 — 16 can wait for a quiet week." That is no longer true. Next 15 entered
Maintenance LTS when 16 shipped, and Maintenance LTS runs two years from a
major's *initial* release. 15 was released 21 October 2024, so **15 reaches end
of life on 21 October 2026 — three weeks from today.** Upgrading to 15 now buys
three weeks of support and then requires the same exercise again.

**2. React 19 is not required.** `next@16` declares
`react: "^18.2.0 || ^19.0.0"`. The old step 1 installed React 19 alongside Next
15 and inherited the whole React 19 migration — `next-themes`, `recharts` and
`framer-motion` peer breakage included. Staying on React 18.3.1 removes all of
that from the critical path. Move React separately, later, or not yet.

**3. The advisory count was six. It is now twenty-three.** The table below
replaces the old one. The conclusion has moved: this is no longer "a should-do,
not a drop-everything."

---

## Why bother, honestly

Next 14.2.35 is the last release on the 14 line, and 14 went end of life on
26 October 2025 — eleven months ago. There will never be a patch for anything
found from here on. That was always the real argument.

But the advisory list has also grown while the version stood still. `npm audit`
reports 23 advisories against 14.2.35. Most do not apply to this deployment.
These do:

| Advisory | Why it applies here |
|---|---|
| **GHSA-955p-x3mx-jcvp** — unauthenticated disclosure of internal Server Function endpoints | Server actions are used throughout, including `lib/actions.ts`, which moves money. |
| **GHSA-vfv6-92ff-j949** — cache poisoning via RSC cache-busting collisions | App Router, `>=13.4.6`. |
| **GHSA-wfc6-r584-vfw7** — cache poisoning in RSC responses | App Router, `>=14.2.0`. |
| **GHSA-3g8h-86w9-wvmq** — middleware/proxy redirects can be cache-poisoned | `src/middleware.ts` exists and redirects. |
| **GHSA-68g3-v927-f742** — cache confusion of response bodies for requests with bodies | Every server action POSTs a body. |
| **GHSA-m99w-x7hq-7vfj** — DoS in App Router via Server Actions | As above. |
| GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj — DoS with Server Components | App Router. Availability only. |

Cache poisoning against a multi-tenant app is the one to sit with: the failure
mode is one tenant's rendered output being served to another.

### What does NOT apply, and the evidence for each

Recorded so the next person does not have to re-derive it — and so a wrong
"does not apply" can be caught when the config changes.

| Advisory | Why not |
|---|---|
| GHSA-2xp9-vwfh-vxw4 — AVIF RCE (critical) | Only reachable when a site opts into `image/avif` via `images.formats`. `next.config.mjs` sets `remotePatterns` only and has no `formats` key. |
| GHSA-p293-qw3h-jr36 — Windows RCE | Vercel runs Linux. |
| GHSA-p9j2-gv94-2wf4 — SSRF in rewrites | No `rewrites` in `next.config.mjs`. |
| GHSA-ggv3-7p47-pfv8 — request smuggling in rewrites | Same. |
| GHSA-36qx-fr4f-26g5 — middleware bypass via Pages Router i18n | App Router only; no `src/pages`, no `i18n` config. |
| GHSA-ffhc-5mcf-pf4q — XSS in apps using CSP nonces | This app deliberately does not set `script-src` or use nonces; see the comment in `next.config.mjs`. |
| GHSA-89xv-2m56-2m9x — SSRF in Server Actions on custom servers | No custom server; Vercel serverless. |
| GHSA-c4j6-fc7j-m34r — SSRF via WebSocket upgrades | No WebSocket upgrade handling in `src`. |
| GHSA-4c39-4ccg-62r3 — unbounded Server Action payload in Edge runtime | **Corrected.** This document previously said "every route is `runtime = "nodejs"`". That is false — `src/app/opengraph-image.tsx` is `runtime = "edge"`. The advisory still does not apply, because that file is an image generator and not a server action, but the stated reason was wrong. 65 routes declare nodejs; one declares edge. |
| GHSA-9g9p-9gw9-jx7f, GHSA-h64f-5h5j-jqjh, CVE-2026-27980, CVE-2026-64644 — Image Optimizer DoS | All scoped to **self-hosted** Next. This deploys on Vercel, where `/_next/image` is served by Vercel's own image optimization rather than by the application's Next server. Worth re-checking if the app ever moves off Vercel — `remotePatterns` *is* configured, which is the precondition for two of them. |
| GHSA-4633-3j49-mh5q — cache confusion on invalid UTF-8 bodies | Marginal; needs invalid-UTF-8 bodies against a cached route. |

**postcss.** `npm audit` also reports a HIGH against postcss. It is
`node_modules/next/node_modules/postcss@8.4.31` — nested inside Next, not the
direct devDependency (`postcss@8.5.26`, which is above every flagged range).
It is a build-time CSS transform over this repo's own stylesheets, so there is
no attacker-controlled input to it. It resolves when Next is upgraded.

---

## What is already done

`createClient()` in `lib/supabase/server.ts` is async and awaits `cookies()`,
and all 123 call sites across 34 files await it. That works identically on 14,
15 and 16 — `await` on a non-Promise is a no-op — so it is already deployed and
already proven in production.

That was ~90% of the mechanical work. What follows is roughly 15 edits.

---

## Step 1 — install

```bash
npm install next@16.3.7
```

That is the whole install. **Do not bring React 19 along.** Next 16 supports
React 18.2+, and pinning React at 18.3.1 keeps `next-themes@0.3`,
`recharts@2.15` and `framer-motion@11` on versions they were tested against.
React 19 is a separate migration with its own risk; see *Afterwards*.

## Step 2 — run the official codemod

```bash
npx @next/codemod@latest upgrade latest
```

This handles the async `params` / `searchParams` change (Next 15's, still the
shape in 16) along with the 16-specific renames. Review its diff rather than
trusting it — it is good but it does sometimes wrap things that were already
awaited.

## Step 3 — let the compiler find the rest

```bash
npx tsc --noEmit
```

This is the whole verification strategy for this migration, and it is a good
one: every remaining break is a Promise being used as a value, which is a type
error by construction. Work the list to zero.

The files it will name, if the codemod missed them:

**`params` — six files, all dynamic segments**

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
- `src/app/opengraph-image.tsx` — the one `runtime = "edge"` file, and so the
  one most likely to behave differently.

## Step 5 — the suites

```bash
npm test
```

87 suites. They do not know about Next versions, so any failure is a real
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

Once on 16, these become worth a look, in this order:

1. `@supabase/ssr` 0.5.2 → 0.12.x. Seven minors behind, with newer cookie
   handling.
2. React 18 → 19, and with it `next-themes` 0.3 → 0.4, `recharts` 2 → 3
   (npm already warns 2.x is unmaintained), `framer-motion` 11 → 13,
   `tailwind-merge` 2 → 3. This is its own migration; give it its own week.
3. `tailwindcss` 3 → 4 — a config-format rewrite, and the largest of these.

Do not do these in the same commit as the upgrade. The whole reason this one is
tractable is that the wide mechanical change was separated from the risky one.
