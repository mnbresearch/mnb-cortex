/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  /*
    CSP — deliberately the directives that CANNOT break this app.

    The real XSS fix is escaping at the sink (lib/utils.ts mdToHtml, which feeds
    24 dangerouslySetInnerHTML call sites). This is defence in depth behind it,
    and it matters more than usual here because Supabase's SSR client sets the
    auth cookies with httpOnly:false, so script execution equals session theft.

    What is NOT set, and why: `script-src`. Next.js App Router inlines its
    hydration bootstrap and streams inline scripts for every Suspense boundary.
    Without per-request nonces (which need middleware rewriting every response)
    the only workable value is 'unsafe-inline', which buys nothing. Shipping a
    CSP that is either useless or breaks hydration in production is worse than
    shipping these four, each of which closes a real escalation path and none of
    which can affect rendering:

      object-src 'none'   — no <object>/<embed> plugin execution
      base-uri 'self'     — an injected <base> cannot re-point every relative
                            script URL at an attacker's host
      form-action         — an injected <form> cannot POST the user's input
                            off-site. Cashfree is allow-listed; see below.
      frame-ancestors     — clickjacking, and unlike X-Frame-Options this one
                            is still honoured by modern browsers

    THE CASHFREE ALLOW-LIST, and why it is not optional.

    This directive read `form-action 'self'`, with a comment claiming "no form
    in this app posts to an external origin; Cashfree checkout is a redirect".
    That claim was wrong, and it broke every payment the product could take.

    Cashfree's v3 SDK does not redirect in `_modal` mode. It creates an iframe
    and SUBMITS A FORM into it, at
    https://api.cashfree.com/pg/view/sessions/checkout. `form-action 'self'`
    blocks exactly that. The browser fires a securitypolicyviolation, the
    iframe never navigates, and `cf.checkout()` neither resolves nor rejects —
    so the customer watches a spinner forever, the "modal closed" catch in
    checkout-client.ts never fires, and nothing anywhere reports an error.
    Silent, total, and indistinguishable from a slow network.

    Verified in production with the live CSP:
      directive:  form-action
      blockedURI: https://api.cashfree.com/pg/view/sessions/checkout

    Both hosts are listed because cfMode() picks between them, and a sandbox
    deployment must not fail in a different way from production.

    Nothing is loosened beyond this: the whole point of form-action is to stop
    an injected form exfiltrating input to an arbitrary host, and naming two
    payment hosts keeps that property against every other origin.
  */
  {
    key: "Content-Security-Policy",
    value: [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://api.cashfree.com https://sandbox.cashfree.com https://payments.cashfree.com https://payments-test.cashfree.com",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  images: {
    // hostname "**" made /_next/image an OPEN PROXY: anyone could pass any
    // https URL and have this domain fetch, transform and serve it. On Hobby
    // that is a 1000-transformation monthly quota a stranger can exhaust in
    // minutes, after which images degrade site-wide — and it lends the domain
    // to serving arbitrary third-party content. Only hosts actually used.
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "cortex.mnbresearch.com" },
      { protocol: "https", hostname: "mnbresearch.com" },
      { protocol: "https", hostname: "*.mnbresearch.com" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
