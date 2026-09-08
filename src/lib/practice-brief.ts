
/*
  THE THING A CA FIRM ACTUALLY SELLS.

  NO IMPORTS IN THIS FILE, DELIBERATELY.

  composeBrief() is pure over its input, and it lives apart from the code that
  fetches that input so a test can EXECUTE it. The first version had
  `import "server-only"` at the top, which makes the module unloadable from
  node — so the only way to check what this document says would have been to
  read it. That is exactly how the paywall list and the ALLOW list drifted
  apart, and this output goes out over a chartered accountant's name.

  The fetching half lives in practice-brief-data.ts.


  The Practice console already ranks every client by who needs attention, shows
  overdue receivables, 43B(h) exposure, open alerts and week-on-week movement.
  That is a good screen for the firm's own decision — who to call first.

  It is not the firm's DELIVERABLE. A practice does not get paid for knowing
  which client is in trouble; it gets paid for telling the client, in writing,
  in the firm's own name. Today that means reading the console, opening a Word
  document, and retyping the numbers by hand — 25 times a month. Which means it
  does not happen, which means the console gets looked at once and forgotten.

  This produces that letter. Same numbers, arranged as something a partner can
  read in ten seconds, adjust if they disagree, and send.

  FOUR DESIGN DECISIONS, EACH OF WHICH COULD HAVE GONE THE OTHER WAY

  1. IT IS THE FIRM'S DOCUMENT, NOT OURS. No Cortex branding, no footer, no
     "powered by". The firm's name is at the top. That is deliberate and it is
     the whole point: a CA forwarding a vendor's marketing to their client looks
     like a reseller, and will not do it twice. We are the drafting tool, and
     tools do not sign the letter.

  2. NO AI. Every sentence below is assembled from figures already computed for
     the console. A brief that costs credits is a brief the firm rations; one
     that costs nothing is one they send to all 25 clients every Monday. It is
     also the difference between a number that is right and a number that is
     probably right — and this goes out over a chartered accountant's name.

  3. IT SAYS WHAT TO DO, WITH A NUMBER. "Receivables are elevated" is not
     advice. "₹8,40,000 is past due, ₹3,10,000 of it with one party, and the
     oldest is 94 days" is something a client can act on before lunch.

  4. IT REFUSES TO PAD. A quiet client gets four lines saying so. The temptation
     is to manufacture concern so the report looks substantial, and a firm that
     sends 25 identical worried letters is teaching its clients not to read
     them.
*/

export type ClientBrief = {
  orgId: string;
  clientName: string;
  firmName: string;
  periodLabel: string;
  /** Plain text, ready to paste into an email. */
  text: string;
  /** The same content as light HTML, for print or a rich-text paste. */
  html: string;
  /** True when there was genuinely nothing to report — the caller may say so. */
  quiet: boolean;
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const esc = (s: string) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type BriefInput = {
  orgId: string;
  clientName: string;
  receivablesOverdue: number;
  msmeAtRisk: number;
  openAlerts: number;
  recovered: number;
  movedPct: number | null;
  /** Top debtors, worst first. Empty when the client has no receivables data. */
  topDebtors?: { party: string; amount: number; days: number }[];
  oldestDays?: number;
};

/**
 * Compose the brief. Pure over its input so it can be tested without a database
 * and without a clock — every figure is passed in, nothing is fetched here.
 */
export function composeBrief(input: BriefInput, firmName: string, now = new Date()): ClientBrief {
  const {
    orgId, clientName, receivablesOverdue, msmeAtRisk, openAlerts,
    recovered, movedPct, topDebtors = [], oldestDays = 0,
  } = input;

  const periodLabel = now.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  /* ---- the findings, worst first, each with a number in it -------------- */
  const findings: string[] = [];
  const actions: string[] = [];

  if (receivablesOverdue > 0) {
    findings.push(`${inr(receivablesOverdue)} of your invoices are past their due date.`);
    if (oldestDays >= 90) {
      findings.push(`The oldest has been outstanding for ${oldestDays} days. Recovery rates fall sharply past ninety.`);
    } else if (oldestDays > 0) {
      findings.push(`The oldest has been outstanding for ${oldestDays} days.`);
    }

    const top = topDebtors[0];
    if (top && top.amount > 0 && receivablesOverdue > 0) {
      const share = Math.round((top.amount / receivablesOverdue) * 100);
      if (share >= 30) {
        findings.push(
          `${share}% of it sits with one party — ${top.party}, ${inr(top.amount)}. That is a concentration issue as much as a collections one.`,
        );
      }
    }
    actions.push(
      topDebtors.length
        ? `Chase these first: ${topDebtors.slice(0, 3).map((d) => `${d.party} (${inr(d.amount)}${d.days ? `, ${d.days} days`: ""})`).join("; ")}.`
        : `Prioritise the oldest balances — they are the ones least likely to be recovered.`,
    );
  }

  if (msmeAtRisk > 0) {
    findings.push(
      `${inr(msmeAtRisk)} is owed to suppliers past the 45-day window in section 43B(h).`,
    );
    /*
      The one piece of genuine tax advice in here, and it is phrased as a
      deadline rather than a threat. A CA does not need to be told what 43B(h)
      does; the client reading over their shoulder does.
    */
    actions.push(
      `Clear or reclassify the 43B(h) balances before year end. Unpaid past 45 days, those amounts are disallowed as a deduction in the year they were incurred and only allowed when actually paid.`,
    );
  }

  if (movedPct !== null && Math.abs(movedPct) >= 5) {
    const dir = movedPct > 0 ? "risen" : "fallen";
    findings.push(`Receivables have ${dir} ${Math.abs(movedPct)}% since last week.`);
  }

  if (openAlerts > 0) {
    findings.push(`${openAlerts} ${openAlerts === 1 ? "warning is" : "warnings are"} open on your account and unread.`);
  }

  const quiet = findings.length === 0;

  /* ---- assemble --------------------------------------------------------- */
  const opening = quiet
    ? `We reviewed your position as at ${periodLabel}. Nothing needs your attention this week — receivables are within terms, no supplier balance has crossed the 45-day mark, and no warnings are outstanding.`
    : `We reviewed your position as at ${periodLabel}. Here is what stands out.`;

  const recoveredLine = recovered > 0
    ? `\n\nSince we started monitoring, ${inr(recovered)} of previously overdue invoices has been collected.`
    : "";

  const lines: string[] = [];
  lines.push(`${clientName} — position review`);
  lines.push(periodLabel);
  lines.push("");
  lines.push(opening);

  if (findings.length) {
    lines.push("");
    lines.push("WHAT WE FOUND");
    for (const f of findings) lines.push(`  • ${f}`);
  }
  if (actions.length) {
    lines.push("");
    lines.push("WHAT WE SUGGEST");
    for (const a of actions) lines.push(`  • ${a}`);
  }
  if (recoveredLine) lines.push(recoveredLine.trim());

  lines.push("");
  lines.push("Happy to go through any of this on a call.");
  lines.push("");
  lines.push(firmName);

  const text = lines.join("\n");

  const html = [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#111;line-height:1.6;max-width:640px">`,
    `<h2 style="margin:0 0 2px;font-size:18px">${esc(clientName)} — position review</h2>`,
    `<div style="color:#666;font-size:13px;margin-bottom:16px">${esc(periodLabel)}</div>`,
    `<p style="margin:0 0 14px">${esc(opening)}</p>`,
    findings.length
      ? `<p style="margin:0 0 6px;font-weight:600;font-size:13px;letter-spacing:.04em">WHAT WE FOUND</p><ul style="margin:0 0 14px;padding-left:18px">${findings.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>`
      : "",
    actions.length
      ? `<p style="margin:0 0 6px;font-weight:600;font-size:13px;letter-spacing:.04em">WHAT WE SUGGEST</p><ul style="margin:0 0 14px;padding-left:18px">${actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
      : "",
    recoveredLine ? `<p style="margin:0 0 14px">${esc(recoveredLine.trim())}</p>` : "",
    `<p style="margin:0 0 14px">Happy to go through any of this on a call.</p>`,
    `<p style="margin:0;font-weight:600">${esc(firmName)}</p>`,
    `</div>`,
  ].filter(Boolean).join("");

  return { orgId, clientName, firmName, periodLabel, text, html, quiet };
}
