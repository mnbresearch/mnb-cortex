/**
 * The GST rate slabs, in one place.
 *
 * GST 2.0, effective 22 September 2025, abolished the 12% and 28% slabs —
 * 12% goods moved mostly to 5%, 28% to 18% — and added 40% for demerit goods
 * (tobacco, sugary aerated drinks, luxury vehicles). The special rates for
 * bullion and stones were untouched.
 *
 * This exists because the rate list was previously hardcoded in `gst-calc.tsx`
 * while `invoice-generator.tsx` and `quote-builder.tsx` took a free numeric
 * field with no list at all. Fixing the calculator's slabs therefore did
 * nothing for the two surfaces that produce an actual document a customer
 * receives — you could still type 28 into an invoice and send it.
 *
 * The invoice and quote fields stay free-entry rather than becoming a dropdown:
 * legacy invoices get reissued, and a hard whitelist would block a genuine
 * edge case at the worst moment. They warn instead. `isValidGstRate` is what
 * they warn on.
 */

export const GST_RATES_AS_OF = "GST 2.0 · effective 22 September 2025";

export const GST_RATES = [
  { v: 0, note: "exempt / nil-rated" },
  { v: 0.25, note: "rough diamonds" },
  { v: 3, note: "gold, silver, jewellery" },
  { v: 5, note: "merit rate" },
  { v: 18, note: "standard rate" },
  { v: 40, note: "demerit goods" },
] as const;

/** Slabs abolished by GST 2.0, named so the warning can be specific. */
export const GST_ABOLISHED: Record<number, string> = {
  12: "12% was abolished on 22 Sep 2025 — most 12% goods moved to 5%",
  28: "28% was abolished on 22 Sep 2025 — most 28% goods moved to 18%",
};

export function isValidGstRate(rate: number): boolean {
  return GST_RATES.some((r) => r.v === rate);
}

/** A human warning for a rate that is not a current slab, or null if it is. */
export function gstRateWarning(rate: number): string | null {
  if (isValidGstRate(rate)) return null;
  if (GST_ABOLISHED[rate]) return GST_ABOLISHED[rate];
  if (rate < 0) return "A negative GST rate is not valid";
  return `${rate}% is not a current GST slab (0, 0.25, 3, 5, 18 or 40)`;
}
