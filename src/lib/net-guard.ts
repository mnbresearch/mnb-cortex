import "server-only";
import { lookup } from "node:dns/promises";

/*
  SERVER-SIDE REQUESTS TO ADDRESSES THE CUSTOMER CHOSE.

  THE HOLE THIS CLOSES

  Six places in this app take a URL a customer typed — the CSV importer, the
  saved-integration sync, a Shopify shop domain, a Slack webhook, an outbound
  webhook endpoint — and `fetch()` it from our server. Our server is inside the
  hosting provider's network. The customer's browser is not. So "fetch this URL
  for me" is a request to make a machine with private network access act as the
  customer's proxy.

  The importer had a scheme test:

      if (!/^https:\/\//.test(url)) return { inserted: 0, error: ... };

  which is applied to the URL as typed, and `fetch` follows redirects. Host
  `https://attacker.example/r`, return `302 -> http://169.254.169.254/…` or
  `http://10.0.0.5/`, and the check has already passed. Worse, this one is not
  blind: unmatched columns come back to the caller in the error string —

      `None of the columns at that URL were recognised (found: ${headers…})`

  — and `headers` is the first line of whatever the server received, split on
  commas. That turns an internal HTTP response into a value on the customer's
  screen, and the response status into a working port scanner.

  WHAT THIS DOES ABOUT IT

  Resolve the hostname to actual addresses and refuse the private ranges,
  BEFORE connecting, and then do it again on every redirect hop rather than
  trusting the first answer. Both halves are needed:

  - Checking the hostname's text is not enough. `http://169.254.169.254.nip.io/`
    is a public name that resolves to a private address, and an attacker
    controlling a DNS record can point any name anywhere.

  - Checking only the first URL is not enough, which is the bug above.

  WHAT IT DOES NOT DO

  This is not a complete SSRF defence and should not be described as one. DNS
  rebinding — answering our resolution with a public address and the subsequent
  connection with a private one — is not addressed, because closing it properly
  means pinning the connection to the address we validated, which Node's fetch
  does not expose. The gap is narrow (the attacker needs control of an
  authoritative nameserver and a race against our own connect) and the
  consequence of the remaining path is a request to an internal host, not
  credentialed access. Naming it here so nobody reads the file and concludes
  more than it earns.
*/

/** RFC1918, loopback, link-local (incl. cloud metadata), CGNAT, and friends. */
function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0) return true;                       // "this network"
  if (a === 10) return true;                      // RFC1918
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local — AWS/GCP metadata lives here
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  /*
    /24, NOT /16 — the comment said /24 and the code said /16, and the code won.

    Automattic owns 192.0.66.0/24, 192.0.77.0/24, 192.0.78.0/24 and
    192.0.79.0/24 — ordinary public unicast. wordpress.com resolves to
    192.0.78.9. So the /16 test refused every WordPress.com and WP VIP host: a
    customer whose webhook endpoint, Shopify storefront or CSV lives there was
    told their own public address was "on a private network", and the webhook
    path recorded a delivery failure and retried into the same wall forever.

    The reserved block is 192.0.0.0/24 (IETF protocol assignments) plus
    192.0.2.0/24 (TEST-NET-1). Both named, nothing wider.
  */
  if (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT — shared provider space
  if (a >= 224) return true;                      // multicast + reserved + broadcast
  return false;
}

/**
 * Expand an IPv6 string into its eight 16-bit groups, or null if it is not one.
 *
 * Handles `::` compression and a trailing dotted quad
 * (`::ffff:169.254.169.254`), so the caller gets one canonical shape to reason
 * about instead of the half-dozen ways the same address can be written.
 */
function v6Groups(s: string): number[] | null {
  let str = s;

  /*
    A trailing dotted quad becomes two hex groups first, so the rest of the
    parse only ever deals with hextets.
  */
  const dotted = str.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const q = dotted[2].split(".").map(Number);
    if (q.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    str = `${dotted[1]}${((q[0] << 8) | q[1]).toString(16)}:${((q[2] << 8) | q[3]).toString(16)}`;
  }

  const halves = str.split("::");
  if (halves.length > 2) return null;

  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((h) => (/^[0-9a-f]{1,4}$/.test(h) ? parseInt(h, 16) : NaN));

  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if ([...head, ...tail].some((n) => Number.isNaN(n))) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;

  const fill = 8 - head.length - tail.length;
  if (fill < 0) return null;
  return [...head, ...Array(fill).fill(0), ...tail];
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique local
  if (s.startsWith("fe80")) return true;                     // link-local
  if (s.startsWith("ff")) return true;                       // multicast

  /*
    ==========================================================================
    IPv4-MAPPED FORMS, CHECKED AS NUMBERS — NOT AS A DOTTED-QUAD STRING
    ==========================================================================

    This used to be:

        const m = s.match(/(?:^::ffff:|^::)(\d+\.\d+\.\d+\.\d+)$/);
        if (m) return isPrivateV4(m[1]);

    The intent was right and the comment named the exact target —
    `::ffff:169.254.169.254` is "the metadata endpoint wearing a different
    hat". The regex only ever matched the DOTTED spelling, and by the time
    assertPublicUrl sees a URL host, the WHATWG parser has already
    re-serialised it to hex:

        new URL("https://[::ffff:169.254.169.254]/").hostname
          === "[::ffff:a9fe:a9fe]"

    So the regex never fired on the one path where an attacker chooses the
    string. Executed against the old code, all four of these were ALLOWED:

        https://[::ffff:169.254.169.254]/latest/meta-data/   → cloud metadata
        https://[::ffff:127.0.0.1]/
        https://[::ffff:10.0.0.1]/
        https://[0:0:0:0:0:ffff:169.254.169.254]/

    while the plain `https://169.254.169.254/` was correctly blocked. The
    dotted form still mattered — dns.lookup returns dotted quads — so the old
    branch was doing real work on the DNS path and none on the literal path,
    which is why it looked correct.

    Parsing to groups removes the spelling from the question entirely. Every
    way of writing the same address now reduces to the same eight numbers.
  */
  const g = v6Groups(s);
  if (!g) return true; // unparseable: refuse rather than guess

  const v4FromTail = () =>
    `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;

  const zero = (n: number) => g.slice(0, n).every((x) => x === 0);

  /* ::ffff:a.b.c.d — IPv4-mapped (RFC 4291). The common one. */
  if (zero(5) && g[5] === 0xffff) return isPrivateV4(v4FromTail());

  /* ::ffff:0:a.b.c.d — IPv4-translated (RFC 2765). */
  if (zero(4) && g[4] === 0xffff && g[5] === 0) return isPrivateV4(v4FromTail());

  /*
    ::a.b.c.d — IPv4-compatible, deprecated but still parsed by most stacks.
    `::` and `::1` are already handled above, so a non-zero tail here is a real
    embedded v4 address.
  */
  if (zero(6) && (g[6] !== 0 || g[7] !== 0)) return isPrivateV4(v4FromTail());

  /*
    64:ff9b::/96 — NAT64 (RFC 6052). A translator rewrites these to the
    embedded v4 address, so `64:ff9b::169.254.169.254` reaches metadata on any
    network running one. Cheap to cover and the same class of mistake.
  */
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isPrivateV4(v4FromTail());
  }

  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateV6(ip) : isPrivateV4(ip);
}

export class BlockedUrlError extends Error {
  constructor(message: string) { super(message); this.name = "BlockedUrlError"; }
}

/**
 * Reject anything that is not a public https:// (or http://) endpoint.
 * Throws BlockedUrlError with a message safe to show a customer.
 */
export async function assertPublicUrl(raw: string, opts: { allowHttp?: boolean } = {}): Promise<URL> {
  let u: URL;
  try { u = new URL(String(raw || "").trim()); }
  catch { throw new BlockedUrlError("That doesn't look like a valid web address."); }

  const ok = opts.allowHttp ? ["http:", "https:"] : ["https:"];
  if (!ok.includes(u.protocol)) {
    /*
      Named explicitly rather than falling through to a generic message,
      because `file:` and `gopher:` are the two schemes people actually try,
      and a vague error invites a second attempt rather than a support ticket.
    */
    throw new BlockedUrlError(`Only ${opts.allowHttp ? "http and https" : "https"} addresses can be fetched.`);
  }
  if (u.username || u.password) throw new BlockedUrlError("Remove the username and password from that address.");

  const host = u.hostname.replace(/^\[|\]$/g, "");

  // A literal address needs no resolution and must be checked as written.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) throw new BlockedUrlError("That address is on a private network, so it can't be fetched from here.");
    return u;
  }
  if (/^localhost$/i.test(host) || /\.local$/i.test(host) || !host.includes(".")) {
    throw new BlockedUrlError("That address is on a private network, so it can't be fetched from here.");
  }

  /*
    BOUNDED. The caller's AbortSignal reaches fetch() and not this, so a
    customer's dead domain with a hanging resolver would stall here outside
    every timeout the caller thinks it has — on webhooks.ts that is a loop over
    200 pending deliveries inside a 20-second cron share, held up by one bad
    endpoint.
  */
  let addrs: { address: string }[];
  try {
    addrs = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("dns timeout")), 5_000)),
    ]);
  } catch { throw new BlockedUrlError("That address could not be found."); }

  /*
    EVERY answer, not the first. A name can return one public and one private
    address, and which one `fetch` picks is not ours to decide — so if any of
    them is private, the name is refused.
  */
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new BlockedUrlError("That address resolves to a private network, so it can't be fetched from here.");
  }
  return u;
}

/**
 * fetch() that validates the destination on every hop instead of trusting the
 * first one. `redirect: "manual"` is the whole point: the default follows
 * redirects inside undici, where our check cannot see them.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number; allowHttp?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const { maxRedirects = 4, allowHttp = false, timeoutMs = 15_000, ...rest } = init;
  let url = (await assertPublicUrl(raw, { allowHttp })).toString();

  /*
    ==========================================================================
    A DEFAULT DEADLINE, BECAUSE FIVE OF SIX CALL SITES SUPPLIED NONE
    ==========================================================================

    This passed `init` straight to fetch and added no signal of its own. Only
    webhooks.ts set one (8s). importFromUrl, both Shopify calls, the Google
    Sheets pull and the Slack probe each had no deadline at all.

    The 5s DNS race in assertPublicUrl bounds RESOLUTION only — not the
    connection, and not the body read. A customer endpoint that accepts and
    then dribbles bytes holds the request open indefinitely. sync/index.ts
    already names the consequence: "A provider pull is an external HTTP call
    with no timeout of its own: budget generously and stop rather than risk
    the whole run." The cron budget protects the siblings; nothing protected
    the call.

    An explicit `signal` from the caller still wins — webhooks.ts keeps its
    tighter 8s — so this is a floor for the callers that forgot, not a ceiling
    imposed on the ones that thought about it.

    The deadline covers the WHOLE redirect chain rather than resetting per
    hop, because four hops of 15s each is a minute, which is not a deadline.
  */
  const hasOwnSignal = Boolean((rest as any).signal);
  const ctrl = hasOwnSignal ? null : new AbortController();
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;

  try {
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(url, { ...rest, redirect: "manual", ...(ctrl ? { signal: ctrl.signal } : {}) });
    if (res.status < 300 || res.status > 399) return res;
    const loc = res.headers.get("location");
    if (!loc) return res;
    /*
      METHOD AND BODY ARE PRESERVED ACROSS A HOP, DELIBERATELY, EXCEPT ON 303.

      Native fetch downgrades POST to GET on 301/302 for historical reasons.
      Keeping the method is what a webhook receiver expects — a Slack or
      customer endpoint that answers 302 should still receive the POST and its
      body, not a bodyless GET that looks like a health check.

      303 See Other is different: it means "the response is elsewhere, go GET
      it", and re-POSTing to it is wrong. Handled explicitly rather than
      inherited.

      Note the consequence of preserving: our headers travel too, including
      X-Cortex-Signature and the Shopify token. That is acceptable only because
      every hop is re-validated as a public host — but it is why the redirect
      budget is 4 and not unlimited.
    */
    if (res.status === 303) {
      (rest as any).method = "GET";
      delete (rest as any).body;
    }
    /*
      Resolve relative Locations against the CURRENT url, then re-validate.
      A relative redirect cannot change host, but writing the general case is
      cheaper than reasoning about which redirects are safe to skip.
    */
    url = (await assertPublicUrl(new URL(loc, url).toString(), { allowHttp })).toString();
  }
  throw new BlockedUrlError("That address redirected too many times.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
