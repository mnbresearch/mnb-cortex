import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "MNB Cortex — Know what's going wrong, before it costs you",
  description: "The early-warning system for Indian businesses. Cortex reads your Tally, Vyapar or Excel exports and tells you who hasn't paid, what's due and what's about to run out — by email, before it costs you. Keep your accounting software.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MNB Cortex", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/apple-touch-icon.png" },
  metadataBase: new URL("https://cortex.mnbresearch.com"),
  openGraph: { title: "MNB Cortex — Your books tell you what happened. Cortex tells you what's about to.", description: "Reads your Tally, Vyapar or Excel exports and warns you who hasn't paid, what's due and what's about to run out — by email, before it costs you.", type: "website", url: "https://cortex.mnbresearch.com" },
  twitter: { card: "summary_large_image", title: "MNB Cortex — Know what's going wrong, before it costs you", description: "The early-warning system for Indian businesses. Keep your accounting software; this is the part it was never built to do." },
};

const jsonLd = {"@context": "https://schema.org", "@graph": [{"@type": "SoftwareApplication", "@id": "https://cortex.mnbresearch.com/#app", "name": "MNB Cortex", "url": "https://cortex.mnbresearch.com", "applicationCategory": "BusinessApplication", "operatingSystem": "Web", "description": "Early-warning system for Indian businesses: reads Tally, Zoho Books, Vyapar or spreadsheet exports and flags unpaid invoices, upcoming dues, book closing and stock about to run out.", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "INR", "description": "Free 2-minute health check; paid plans on the pricing page"}, "publisher": {"@id": "https://www.mnbresearch.com/#organization"}}, {"@type": "Organization", "@id": "https://www.mnbresearch.com/#organization", "name": "MNB Research", "legalName": "Abrobot Technologies Private Limited", "url": "https://www.mnbresearch.com", "address": {"@type": "PostalAddress", "streetAddress": "1945 P, Sainik Colony, Sector 49", "addressLocality": "Faridabad", "addressRegion": "Haryana", "postalCode": "121001", "addressCountry": "IN"}}]};

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
