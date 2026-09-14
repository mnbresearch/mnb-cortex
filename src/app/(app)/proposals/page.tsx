import { Topbar } from "@/components/topbar";
import { PageShell } from "@/components/page-shell";
import { Section } from "@/components/section";
import { Card } from "@/components/ui/card";
import { AIPanel } from "@/components/ai-panel";
import { FileSignature, IndianRupee, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

const tips = [
  { icon: FileSignature, t: "Lead with their problem", d: "Restate the requirement before your credentials" },
  { icon: IndianRupee, t: "Itemise commercials", d: "Phased pricing wins more than a single lump sum" },
  { icon: Clock, t: "Put a date on it", d: "Milestones make the scope feel real and bounded" },
];

const starters = [
  "Growth audit + GTM strategy for a D2C brand, 6 weeks",
  "Monthly retainer: strategy + reporting for an EdTech startup",
  "Website rebuild + SEO for a manufacturer, fixed fee",
  "Market-entry study for a UAE expansion",
];

export default function Proposals() {
  return (
    <>
      <Topbar title="Proposal & Quote Generator" subtitle="A client-ready proposal in one pass" />
      <PageShell>
        <div className="grid sm:grid-cols-3 gap-3">
          {tips.map((t) => (
            <Card key={t.t} className="p-4 hover-lift">
              <div className="h-10 w-10 rounded-xl brand-gradient grid place-items-center text-white"><t.icon className="h-5 w-5" /></div>
              <div className="font-medium text-sm mt-2">{t.t}</div>
              <div className="text-sm text-muted-foreground">{t.d}</div>
            </Card>
          ))}
        </div>

        {/* The "Quick starts" chips were non-interactive <Badge> spans under
            the words "Tap one, paste it above and adapt". They are buttons in
            the panel now — see the note in AIPanel's `suggestions` prop. */}
        <Section title="Write the proposal" desc="Describe the client, scope and budget — get scope, timeline, commercials and next steps">
          <AIPanel
            mode="proposal"
            placeholder="e.g. FMCG brand doing ₹8 Cr wants a growth audit + 3-month GTM plan. Budget around ₹4–5 L. Two workshops needed."
            aria-label="Describe the client, scope and budget for the proposal"
            cta="Generate proposal"
            multiline
            saveMode="strategy"
            suggestions={starters}
          />
          <p className="text-xs text-muted-foreground mt-2">Save it to your workspace, then export from Reports as a PDF to send.</p>
        </Section>
      </PageShell>
    </>
  );
}
