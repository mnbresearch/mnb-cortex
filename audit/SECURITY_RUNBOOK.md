# MNB Cortex: Production Security Operations Runbook

**Date:** 9 November 2026  
**Auditor / Security Engineer:** @MRIDUL NANDA  
**Classification:** Confidential — Internal Engineering Runbook

---

## 1. Threat Model & Trust Boundaries

```
[ Anonymous Web / Browser ]
           │ (HTTPS, CSP, HSTS, CORS)
           ▼
[ Next.js Edge / App Router (Vercel) ]
  ├── Client Chunks (Only NEXT_PUBLIC_SUPABASE_ANON_KEY exposed)
  ├── Server Actions & API Routes (requireRole, isSuperAdmin, csrf, ratelimit)
  ├── NetGuard SSRF Validator (Blocks 127.0.0.1, 10.0.0.0/8, 169.254.169.254)
  └── Crypto Vault (AES-256-GCM envelope encryption for BYO keys)
           │ (Stateless HTTP PostgREST, no-store, JWT bearer auth)
           ▼
[ Supabase PostgreSQL 18.3 ]
  ├── Row Level Security (RLS) on all 52 tenant tables
  ├── Rank Gates: user_org_rank(org_id) >= 2 (Analyst write), >= 3 (Manager delete)
  ├── Definer Lockdowns: SECURITY DEFINER search_path = public, fixed ACLs
  └── Audit Trail: system_status, action_proposals, api_key_events
```

---

## 2. Secrets Management & Rotation Procedures

Cortex maintains zero hardcoded secrets in its source tree or git history. All credentials are read strictly from runtime environment variables.

### How to Rotate Compromised or Scheduled Keys

#### A. Supabase Service Role & Anon Keys
1. Navigate to Supabase Dashboard -> **Project Settings** -> **API**.
2. Under **Project API Keys**, locate `service_role` (secret) and `anon` (public).
3. Click **Generate New Key** / **Rotate Key**. Note: Supabase provides a 24-hour grace period for the old key.
4. Update Vercel environment variables:
   ```bash
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   ```
5. Trigger redeployment: `vercel redeploy --prod`.
6. Run verification: `npm run test:secret-scan && npm run test:rls-privileges`.

#### B. Cashfree Secret Key (`CASHFREE_SECRET_KEY`)
1. Log into **Cashfree Merchant Dashboard** -> **Developers** -> **API Keys**.
2. Click **Generate New API Key**.
3. Update `CASHFREE_SECRET_KEY` in Vercel.
4. Verify webhook signature verification: `npm run test:cashfree`.

#### C. Credential Seal Key (`ENCRYPTION_KEY`)
> [!WARNING]
> Changing `ENCRYPTION_KEY` renders existing saved third-party integration credentials (Zoho, WhatsApp) unreadable unless re-encrypted.
1. Run re-encryption script against existing integration records.
2. Update `ENCRYPTION_KEY` (minimum 32 random alphanumeric characters).
3. Verify decryption: `node scripts/test-connector-keys.mjs`.

#### D. Cron Secret (`CRON_SECRET`)
1. Generate high-entropy 64-character secret: `openssl rand -hex 32`.
2. Update `CRON_SECRET` in Vercel.
3. Update Vercel Cron Job authorization header.
4. Test: `curl -H "Authorization: Bearer <NEW_SECRET>" https://cortex.mnbresearch.com/api/cron/autopilot`.

---

## 3. Database Disaster Recovery & PITR Procedure

### Recovery Objectives
- **Recovery Point Objective (RPO):** < 1 hour (via Supabase Point-In-Time-Recovery continuous WAL archiving).
- **Recovery Time Objective (RTO):** < 15 minutes.

### Verified Disaster Recovery Drill
Cortex includes an automated disaster recovery drill script: `scripts/rehearse-restore.mjs`.
The drill executes:
1. Rebuilds empty database from migrations (`ORDER.txt`).
2. Seeds test organizations, customers, and financial records.
3. Exports logical backup snapshot in `/api/admin/backup` format.
4. Simulates total data disaster (`DROP ALL ROWS`).
5. Restores entire database via `scripts/restore.mjs`.
6. Validates 100% cell-by-cell data parity (Quotes, Unicode, Devanagari text, Nulls, UUIDs).

### Manual Emergency Restore Steps
In the event of database corruption or deletion:
1. Download latest encrypted logical backup via `/api/admin/backup` or locate latest hourly PITR snapshot in Supabase dashboard.
2. In Supabase Dashboard -> **Database** -> **Backups** -> **Restore Point in Time**.
3. Select timestamp prior to the incident.
4. If restoring from logical export:
   ```bash
   node scripts/restore.mjs backup-2026-XX-XX.sql.gz
   ```
5. Run integrity check: `npm run rehearse:restore`.

---

## 4. Incident Response Protocols

### Incident 1: Cross-Tenant Data Access Report
1. Immediately invoke platform collections kill switch:
   ```typescript
   await sb.rpc("cortex_set_collections_switch", { p_on: false, p_reason: "Security investigation" });
   ```
2. Inspect `api_key_events` and PostgREST access logs for the anomalous tenant ID.
3. Run RLS privilege regression suite:
   ```bash
   node scripts/test-rank-gates-hardening.cjs
   node scripts/test-rls-privileges.cjs
   ```
4. Verify if finding is policy-level or bypassable through server actions.

### Incident 2: Malicious Webhook Ingestion Attempt
1. Check `/api/pay/cashfree/webhook` logs.
2. Verify HMAC signature failure count.
3. Confirm replay protection arbitrated in database (`payment_refunds` / `cortex_payments`).
4. Ban attacker IP at Cloudflare / Vercel firewall rules.

---

## 5. Continuous Security Verification Suite

Run this full suite before every major production deployment:
```bash
# 1. Automated secret scan
npm run test:secret-scan

# 2. Database RLS and write rank gates
npm run test:rank-gates-hardening
npm run test:rls-privileges
npm run test:definer-grants
npm run test:definer-final-acl

# 3. Webhook HMAC & payments adversarial tests
npm run test:payments-adversarial
npm run test:webhook-events

# 4. XSS & LLM prompt injection defenses
npm run test:xss
npm run test:llm01

# 5. SSRF NetGuard verification
npm run test:net-guard

# 6. Disaster recovery restore rehearsal
npm run rehearse:restore
```
