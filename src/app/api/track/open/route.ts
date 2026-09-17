export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * LEGACY open pixel. Serves the image and records nothing.
 *
 * It used to take `?r=` off the query string and use it as a primary key
 * against `campaign_recipients` with the SERVICE-ROLE client, which bypasses
 * row-level security — no session, no key, no org constraint. Anyone holding a
 * recipient UUID could inflate another workspace's open counters from outside
 * that workspace. See the sibling click route for the full reasoning.
 *
 * The live sender points at /api/t/o/<token>, which keys on a 16-byte random
 * token stored on the row. The only producer of these ?r= links was
 * mailmerge.buildHtml(), which had no callers and is deleted. This stays only
 * so a pixel in an already-delivered email still returns an image.
 */
export async function GET() {
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Length": String(PIXEL.length),
    },
  });
}
