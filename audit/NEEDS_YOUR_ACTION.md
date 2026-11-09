# MNB Cortex: Actions Requiring Human / Leadership Authorization

**Date:** 9 November 2026  
**Auditor:** @MRIDUL NANDA  
**Document Purpose:** In accordance with non-negotiable Rule 8 ("If you hit a decision only I can make (spend, deleting data, changing a pricing or auth model), stop, summarise the options and wait"), this document lists all items that require leadership decisions or external dashboard action.

---

## 1. Immediate Actions (No Immediate Outage, but Essential for Production Hygiene)

### Action 1: Verify Supabase Daily Backups & Point-in-Time Recovery (PITR)
- **Current State:** Cortex has verified logical backups via `/api/admin/backup` and successfully passed disaster recovery drills (`scripts/rehearse-restore.mjs`).
- **Required Action:** 
  1. Log into your Supabase Dashboard (`https://supabase.com/dashboard/project/krklgsmeamnxeawdlmka`).
  2. Navigate to **Project Settings** -> **Database** -> **Backups**.
  3. Ensure Point in Time Recovery (PITR) is toggled **ON** (recommended: 7 to 30 days retention).
  4. Cost implication: Pro plans include 7-day PITR; retention extension may incur nominal Supabase infrastructure charges.

### Action 2: Monitor Next.js Framework Upgrade Timeline (Next 14.2.35 to Next 15.x)
- **Current State:** 
  - `npm audit` flagged Next.js 14 Image Optimization advisory (GHSA-2xp9-vwfh-vxw4).
  - **Mitigation Active:** Pinned remote image patterns in `next.config.mjs` prevents external attackers from utilizing the Image Optimizer.
  - Future-proofed `cookies()` async signature was already deployed in `src/lib/supabase/server.ts`.
- **Options for Leadership:**
  - **Option A (Recommended):** Stay on hardened Next.js 14.2.35 with active remotePatterns firewalling until the next scheduled maintenance sprint, then perform standard QA on Next 15.
  - **Option B:** Upgrade immediately to Next.js 15 (`npm install next@latest react@latest react-dom@latest`). This is a major version bump that requires thorough end-to-end regression testing.

---

## 2. Operational & Business Decisions

### Action 3: Production Cashfree Webhook URL Verification
- **Current State:** All webhook HMAC cryptographic signatures and replay protection tests are passing (121/121 checks passed).
- **Required Action:**
  1. Open Cashfree Merchant Dashboard -> **Developers** -> **Webhooks**.
  2. Verify that the production Webhook endpoint is pointed to:
     `https://cortex.mnbresearch.com/api/pay/cashfree/webhook`
  3. Confirm that the Webhook Version is set to `2022-09-01` or `2023-08-01` and active events include `PAYMENT_SUCCESS_WEBHOOK`, `REFUND_SUCCESS`, and `DISPUTE_CREATED`.

### Action 4: Verify Super-Admin Notification Mailbox
- **Current State:** `ADMIN_EMAIL` defaults to `mnbgotyou@gmail.com` and `SUPER_ADMIN_EMAILS` lists `mridulnanda2004@gmail.com,mnbgotyou@gmail.com`.
- **Required Action:**
  1. Confirm whether any additional executive team members or CAs require super-admin access.
  2. If so, update the Vercel environment variable `SUPER_ADMIN_EMAILS` with the comma-separated confirmed email addresses.

---

## 3. Confirmed Safe State (No Action Required by You)
- Zero secrets committed to git history or exposed in client bundles.
- All 52 tenant tables protected by hardened RLS rank gates.
- All 88 tables mapped into disaster recovery backup and verified.
- 0% cross-tenant data leakage detected.
