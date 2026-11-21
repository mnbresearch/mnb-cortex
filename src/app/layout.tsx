import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/instrument-serif/latin-400-italic.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

/*
  THE CANONICAL HOST comes from NEXT_PUBLIC_APP_URL, the variable the rest of
  the app already reads. To move the brand to mnbcortex.app: make it the
  primary domain in Vercel, add it to Supabase's auth redirect list, then set
  NEXT_PUBLIC_APP_URL=https://mnbcortex.app and redeploy (README → Domains).
*/
const SITE = (process.env.NEXT_PUBLIC_APP_URL || "https://cortex.mnbresearch.com").replace(/\/$/, "");

export const metadata: Metadata = {
  title: "MNB Cortex — The AI agent workspace for enterprises",
  description: "MNB Cortex is the AI agent workspace for enterprises and growing businesses: agent teams, custom agents, document grids, model routing and finished Word, PowerPoint and Excel deliverables — working from your systems and your company's mail, chats and documents. Every action waits for your approval; every answer names its source; every rupee is checked.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MNB Cortex", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  metadataBase: new URL(SITE),
  openGraph: { title: "MNB Cortex — Agents that run the work. You make the calls.", description: "The AI agent workspace for enterprises: agents that work from your systems and your company's knowledge, cite every answer, check every figure and wait for your approval. By MNB Research.", type: "website", url: SITE, siteName: "MNB Cortex" },
  twitter: { card: "summary_large_image", title: "MNB Cortex — Agents that run the work. You make the calls.", description: "The AI agent workspace for enterprises and growing businesses. Keep your systems; Cortex does the work they were never built to do." },
};

const jsonLd = {"@context": "https://schema.org", "@graph": [{"@type": "SoftwareApplication", "@id": `${SITE}/#app`, "name": "MNB Cortex", "alternateName": "Cortex", "url": SITE, "applicationCategory": "BusinessApplication", "operatingSystem": "Web", "description": "AI agent workspace for enterprises and growing businesses: finance, operations and growth agents that read Tally, Zoho Books, Vyapar or spreadsheet data, propose actions for approval and check every figure against the source.", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR", "description": "Free 2-minute health check; paid plans on the pricing page"}, "publisher": {"@id": "https://www.mnbresearch.com/#organization"}}, {"@type": "Organization", "@id": "https://www.mnbresearch.com/#organization", "name": "MNB Research", "legalName": "Abrobot Technologies Private Limited", "url": "https://www.mnbresearch.com", "address": {"@type": "PostalAddress", "streetAddress": "1945 P, Sainik Colony, Sector 49", "addressLocality": "Faridabad", "addressRegion": "Haryana", "postalCode": "121001", "addressCountry": "IN"}}]};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F1E8" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1116" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
