"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, ArrowUpRight } from "lucide-react";
import { CALCULATOR_SEO } from "@/lib/calculator-seo";

/*
  WHAT A STRANGER FROM GOOGLE SEES, AND WHAT THEY CAN DO NEXT.

  THE SITUATION THIS FIXES

  All 29 calculators are public — middleware gates nothing and the data layer
  falls back to demo mode — so search traffic lands on a working GST or gratuity
  calculator wrapped in the LOGGED-IN APPLICATION: a sidebar of ~122 module
  links, a command palette, a notifications bell. To someone who has never heard
  of us that is not a free tool, it is somebody's dashboard they have wandered
  into by mistake.

  And there was no way out of it. No sign-up link, no pricing link, no sentence
  explaining what the surrounding software is. The calculators index page went
  further and told them to "use the modules in the sidebar instead" — copy
  written for a customer, shown to a stranger.

  So the most-visited pages on the site could rank, be useful, and convert
  nobody, because nothing on them said what Cortex is or offered a next step.

  WHY ONE BAR IN THE LAYOUT RATHER THAN A BLOCK ON EVERY PAGE

  The layout already knows whether anyone is signed in. Mounting this once means
  it cannot drift out of sync with the calculator list, and it cannot be
  forgotten when the thirtieth calculator is added — which is exactly how the
  metadata came to be missing from all 29.

  WHAT IT DELIBERATELY DOES NOT DO

  It does not gate the tool, cover it, or interrupt it. The calculator keeps
  working whether or not anyone reads this. A free tool that nags is not a free
  tool, and the point of ranking for "gratuity calculator" is to be the most
  useful answer, not to trap the person who clicked.

  It is dismissible, and the dismissal is remembered for the session only —
  sessionStorage, not localStorage, because someone returning next week has
  forgotten us and the context is worth showing again.
*/

const KEY = "cortex.anonbar.dismissed";

export function AnonToolBar() {
  const path = usePathname();
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  if (hidden) return null;

  /*
    Only on the standalone tools. Elsewhere in the app a logged-out visitor is
    looking at the demo dashboard, which has its own framing and its own CTA —
    two competing invitations on one screen is worse than one.
  */
  const isCalculator = Boolean(path && CALCULATOR_SEO[path]);
  if (!isCalculator) return null;

  const name = path ? CALCULATOR_SEO[path]?.title.split("—")[0].trim() : "This calculator";

  function dismiss() {
    setHidden(true);
    try { sessionStorage.setItem(KEY, "1"); } catch { /* private mode; the state still holds for this page */ }
  }

  return (
    <div className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-7 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="font-medium">{name} is free — no account needed.</span>
        <span className="text-muted-foreground">
          It is one of 29 tools inside MNB Cortex, which watches your receivables and deadlines and emails you before they cost you money.
        </span>
        <span className="flex items-center gap-2 ml-auto">
          <Link href="/health-check" className="rounded-full border h-8 px-3 inline-flex items-center text-xs font-medium hover:bg-accent transition-colors">
            Check your own numbers
          </Link>
          <Link href="/pricing" className="rounded-full btn-ink h-8 px-3 inline-flex items-center gap-1 text-xs font-medium">
            Plans from ₹799 <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <button onClick={dismiss} aria-label="Hide this bar"
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
