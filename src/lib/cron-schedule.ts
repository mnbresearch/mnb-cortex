/**
 * What time the nightly jobs actually run, in the words a customer reads.
 *
 * ============================================================================
 * THE DEFECT THIS EXISTS FOR
 * ============================================================================
 *
 * /autopilot told every owner:
 *
 *     "Scheduled: daily 8:00 AM · findings appear in Activity & Notifications"
 *
 * The cron in vercel.json is `30 4 * * *`. Vercel evaluates cron expressions
 * in UTC, so the job fires at 04:30 UTC — 10:00 IST. Not 8:00 AM in any
 * timezone this product serves.
 *
 * It is a small lie and it has a real cost. An owner who checks at 8:15 and
 * sees nothing concludes the feature is broken, or worse, concludes there was
 * nothing to warn them about. For a product whose entire promise is early
 * warning, "when does it run" is not decoration.
 *
 * ============================================================================
 * WHY A MODULE AND NOT A CORRECTED STRING
 * ============================================================================
 *
 * Because the string was correct once, probably, and then the cron moved.
 * Changing "8:00 AM" to "10:00 AM" fixes today and rebuilds the same trap:
 * two facts in two files with nothing joining them.
 *
 * scripts/test-cron-schedule.mjs reads vercel.json, converts each schedule to
 * IST itself, and fails if what is stated here disagrees. Move the cron and
 * the suite tells you which sentence on which screen is now false.
 *
 * India has no daylight saving and a fixed UTC+05:30 offset, so this
 * conversion is exact year-round — which is the only reason it is safe to
 * state a local time at all.
 */

/** IST is UTC+05:30, with no daylight saving. */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Convert a `minute hour * * *` cron expression (UTC, as Vercel evaluates it)
 * to a human IST time.
 *
 * Returns null for anything that is not a simple daily schedule, so a future
 * every-six-hours cron cannot be silently rendered as one wrong clock time.
 */
export function cronToIst(schedule: string): string | null {
  const parts = String(schedule || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*" || dow !== "*") return null;
  if (!/^\d{1,2}$/.test(min) || !/^\d{1,2}$/.test(hour)) return null;

  const total = (Number(hour) * 60 + Number(min) + IST_OFFSET_MINUTES) % (24 * 60);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix} IST`;
}

/**
 * The autopilot cron, mirrored from vercel.json.
 *
 * Mirrored rather than imported because vercel.json is deployment config and
 * pulling it into the client bundle to render one sentence is the wrong
 * trade. The test is what keeps the mirror honest.
 */
export const AUTOPILOT_CRON = "30 4 * * *";

/** "10:00 AM IST" — what /autopilot shows the owner. */
export const AUTOPILOT_TIME_IST = cronToIst(AUTOPILOT_CRON) ?? "overnight";

export const RECONCILE_CRON = "0 6 * * *";
export const RECONCILE_TIME_IST = cronToIst(RECONCILE_CRON) ?? "overnight";
