import "server-only";
import { serviceClient } from "@/lib/supabase/server";
import { scanForInjection } from "@/lib/ai/untrusted";

/*
  INGEST-TIME TRIPWIRE (LLM01).

  Data that enters from outside — the public API, a store sync, an imported
  file — is where an injection is planted: a customer named "Ignore previous
  instructions…", an order note addressed to "the AI". Nothing here blocks
  the data (an honest record must never be lost to a false positive); the
  agent already treats every row as untrusted (ai/untrusted.ts,
  policy.gateVerdict). What this adds is that the OWNER hears about it the
  day it arrives, with an example, instead of discovering it later in a
  proposal that waited for them.

  Best-effort and bounded: at most 10,000 rows scanned, one alert per batch.
*/
export function suspiciousRows(rows: unknown[]): { count: number; hits: string[]; sample: string | null } {
  let count = 0; const hits: string[] = []; let sample: string | null = null;
  for (const r of (Array.isArray(rows) ? rows : []).slice(0, 10_000)) {
    const strings = r && typeof r === "object" ? Object.values(r as Record<string, unknown>).filter((v): v is string => typeof v === "string") : typeof r === "string" ? [r] : [];
    if (!strings.length) continue;
    const s = scanForInjection(strings.join(" \n "));
    if (!s.suspicious) continue;
    count++;
    for (const h of s.hits) if (!hits.includes(h)) hits.push(h);
    if (!sample) sample = strings.find((x) => scanForInjection(x).suspicious)?.slice(0, 140) ?? null;
  }
  return { count, hits, sample };
}

export async function flagSuspiciousRows(orgId: string | null | undefined, source: string, rows: unknown[]): Promise<number> {
  if (!orgId) return 0;
  try {
    const f = suspiciousRows(rows);
    if (!f.count) return 0;
    const svc = serviceClient();
    if (!svc) return f.count;
    await svc.from("alerts").insert({
      org_id: orgId, severity: "red", module: "security",
      title: `Instruction-like text arrived in ${source} data`,
      body: (`${f.count} record${f.count === 1 ? "" : "s"} from ${source} contain text that looks like instructions to an AI (${f.hits.slice(0, 3).join("; ")})` +
        (f.sample ? `, e.g. "${f.sample}"` : "") +
        `. The records were saved as data. Cortex will not act on such text: anything it proposes after reading it waits for your approval. Check where it came from.`).slice(0, 600),
    });
    return f.count;
  } catch { return 0; }
}
