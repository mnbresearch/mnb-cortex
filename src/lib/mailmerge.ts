import "server-only";
import { signDestination } from "@/lib/track-link";

export type Recipient = { name?: string; email: string; plan?: string; company?: string };

/** Available merge tokens shown in the UI. */
export const MERGE_TOKENS = ["{{name}}", "{{first_name}}", "{{email}}", "{{plan}}", "{{company}}"];

function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replace merge tokens with this recipient's values. */
export function mergeVars(text: string, r: Recipient): string {
  const first = (r.name || "").trim().split(/\s+/)[0] || "there";
  return (text || "")
    .replace(/\{\{\s*name\s*\}\}/gi, r.name || "there")
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*email\s*\}\}/gi, r.email || "")
    .replace(/\{\{\s*plan\s*\}\}/gi, r.plan || "")
    .replace(/\{\{\s*company\s*\}\}/gi, r.company || "");
}

/*
  buildHtml() WAS HERE AND IS DELETED.

  It had no callers anywhere in the repo, and it was the only thing that ever
  produced /api/track/open?r=<id> and /api/track/click?r=<id> — links that keyed
  an unauthenticated service-role write on a caller-supplied row id. Campaigns
  render through renderBrandedEmail() in lib/branded-email.ts, which uses the
  per-recipient token minted in api/email/campaigns/route.ts and points at
  /api/t/o/<token> and /api/t/c/<token>.

  Deleted rather than repointed, because reviving dead code to fix it is how it
  comes back. mergeVars and MERGE_TOKENS below are live and unchanged.
*/
