"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { Magnetic } from "@/components/loco";

const NAV = [
  { href: "/features", label: "Features" },
  { href: "/industries", label: "Industries" },
  { href: "/pricing", label: "Pricing" },
  { href: "/ai-visibility", label: "AI Visibility" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);

  return (
    <>
      <header className={`fixed top-0 inset-x-0 z-40 transition-colors duration-300 ${scrolled ? "glass border-b" : ""}`}>
        <div className="flex items-center justify-between px-5 lg:px-10 h-16">
          <Link href="/" className="flex items-center gap-2.5" aria-label="MNB Cortex home">
            <Logo size={32} />
            <span className="font-semibold tracking-tight">MNB Cortex<sup className="text-[9px] align-super ml-0.5 opacity-60">®</sup></span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="link-sweep text-muted-foreground hover:text-foreground transition-colors">{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="hidden sm:inline text-sm link-sweep text-muted-foreground hover:text-foreground">Sign in</Link>
            <Magnetic>
              <Link href="/login" className="hidden sm:inline-flex items-center gap-1.5 rounded-full btn-ink px-5 h-10 text-sm font-medium">
                Start free <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Magnetic>
            <button onClick={() => setOpen(true)} className="md:hidden h-10 w-10 grid place-items-center rounded-full border" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          </div>
        </div>
      </header>

      {/* Full-screen mobile menu */}
      <div className={`fixed inset-0 z-50 md:hidden transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-0 bg-foreground text-background flex flex-col">
          <div className="flex items-center justify-between px-5 h-16">
            <span className="font-semibold">MNB Cortex</span>
            <button onClick={() => setOpen(false)} className="h-10 w-10 grid place-items-center rounded-full border border-background/30" aria-label="Close menu"><X className="h-5 w-5" /></button>
          </div>
          <nav className="flex-1 flex flex-col justify-center gap-2 px-6">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="font-display display-3 py-1 tracking-tightest hover:opacity-60 transition-opacity">{n.label}</Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="font-display display-3 py-1 tracking-tightest text-primary">Start free →</Link>
          </nav>
          <div className="px-6 pb-8 text-sm text-background/60">contact@mnbresearch.com · +91 97114 88480</div>
        </div>
      </div>
    </>
  );
}

export function PublicFooter() {
  const cols = [
    { h: "Product", links: [["Features", "/features"], ["Industries", "/industries"], ["Compare", "/compare"], ["Pricing", "/pricing"], ["AI Visibility check", "/ai-visibility"], ["Free health check", "/health-check"]] },
    { h: "Company", links: [["Investors", "/investors"], ["Resources", "/resources"], ["Contact", "/contact"], ["Changelog", "/changelog"], ["Status", "/status"], ["MNB Research", "https://www.mnbresearch.com"]] },
    { h: "Legal", links: [["Terms", "/terms"], ["Privacy", "/privacy"], ["Refund Policy", "/refund"]] },
  ];
  return (
    <footer className="bg-foreground text-background">
      <div className="px-5 lg:px-10 pt-20 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-end">
            <div>
              <p className="eyebrow text-background/50">Give your business a brain</p>
              <h2 className="font-display display-2 tracking-tightest mt-4">Put your <span className="text-primary">operating brain</span> to work.</h2>
            </div>
            <div className="lg:justify-self-end">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-background text-foreground px-7 h-14 text-base font-medium hover:opacity-90 transition-opacity" data-cursor>
                Start free — 3-day trial <ArrowUpRight className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="h-px bg-background/15 my-14" />

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2.5"><Logo size={30} /><span className="font-semibold">MNB Cortex</span></div>
              <p className="mt-4 text-sm text-background/60 max-w-xs">The AI operating brain for your business. A brand of Abrobot Technologies Pvt Ltd, Delhi.</p>
              <a href="https://wa.me/919711488480" className="mt-4 inline-block text-sm link-sweep text-background/80">wa.me / +91 97114 88480</a>
            </div>
            {cols.map((c) => (
              <div key={c.h}>
                <p className="eyebrow text-background/50 mb-4">{c.h}</p>
                <ul className="space-y-2.5 text-sm">
                  {c.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href} className="link-sweep text-background/80 hover:text-background">{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-background/50">
            <span>© {new Date().getFullYear()} MNB Cortex · Abrobot Technologies Pvt Ltd. All rights reserved.</span>
            <span className="flex items-center gap-4">
              <a href="mailto:contact@mnbresearch.com" className="link-sweep">contact@mnbresearch.com</a>
              <span>Made in India 🇮🇳</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
