import Link from "next/link";
import { ArrowRight, Activity, Brain, Workflow, ShieldCheck, Eye, TrendingUp, Zap, CheckCircle2 } from "lucide-react";
import { RoiCalculator } from "@/components/roi-calculator";

const feats = [
  { icon: Activity, t: "Monitors continuously", d: "Reads sales, finance, production, inventory & HR in real time." },
  { icon: Brain, t: "Predicts & recommends", d: "Forecasts stockouts, churn, cash crunches before they happen." },
  { icon: Workflow, t: "Executes for you", d: "Drafts POs, invoices, reminders and campaigns automatically." },
  { icon: ShieldCheck, t: "Explains in plain English", d: "Ask 'How is my business?' and get a real answer." },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div>
          <span className="font-semibold">MNB Cortex</span>
        </div>
        <div className="flex items-center gap-4 text-sm"><Link href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link><Link href="/login" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-medium">Sign in</Link></div>
      </header>

      <section className="px-6 lg:px-12 py-20 lg:py-28 max-w-5xl mx-auto text-center">
        <span className="inline-block text-xs font-medium rounded-full border px-3 py-1 text-muted-foreground mb-6">The AI COO for SMEs</span>
        <h1 className="text-4xl lg:text-6xl font-semibold tracking-tight leading-[1.05]">
          Run your company by <span className="gradient-text">asking</span>, not by opening spreadsheets.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          MNB Cortex is an AI Operating System that observes your business, detects problems, predicts outcomes, recommends actions — and executes them.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login" className="rounded-lg bg-primary text-primary-foreground px-6 h-12 inline-flex items-center gap-2 font-medium">
            Open the dashboard <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/dashboard" className="rounded-lg border px-6 h-12 inline-flex items-center font-medium">View live demo</Link>
          <Link href="/pricing" className="rounded-lg border px-6 h-12 inline-flex items-center font-medium">See pricing</Link>
        </div>
      </section>

      <section className="px-6 lg:px-12 pb-24 max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {feats.map((f) => (
          <div key={f.t} className="rounded-xl border p-5 bg-card">
            <f.icon className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold">{f.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </section>
      <section className="px-6 lg:px-12 pb-10 max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Works with your stack</p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
          {["Tally","Zoho","Shopify","QuickBooks","WhatsApp","Salesforce","Google Sheets","Slack"].map((n)=>(<span key={n}>{n}</span>))}
        </div>
      </section>

      <section className="px-6 lg:px-12 pb-8 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-8">How it works</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[{i:Eye,t:"Monitors",d:"Reads sales, finance, inventory, production & HR in real time."},{i:TrendingUp,t:"Predicts",d:"Forecasts stockouts, churn and cash crunches before they hit."},{i:Brain,t:"Recommends",d:"McKinsey-grade advice, grounded in your live numbers."},{i:Zap,t:"Executes",d:"Drafts POs, invoices, reminders and reports for you."}].map((x,i)=>(
            <div key={i} className="rounded-xl border p-5 bg-card"><x.i className="h-6 w-6 text-primary" /><h3 className="mt-3 font-semibold">{x.t}</h3><p className="mt-1 text-sm text-muted-foreground">{x.d}</p></div>
          ))}
        </div>
      </section>

      <section className="px-6 lg:px-12 py-12"><RoiCalculator /></section>

      <section className="px-6 lg:px-12 pb-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-2">Why not just an ERP, CRM or ChatGPT?</h2>
        <p className="text-center text-muted-foreground mb-8">MNB Cortex is an AI COO — it doesn\'t just store data, it acts on it.</p>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left"><th className="p-3"></th><th className="p-3 text-primary font-semibold">MNB Cortex</th><th className="p-3 text-muted-foreground">ERP</th><th className="p-3 text-muted-foreground">CRM</th><th className="p-3 text-muted-foreground">ChatGPT</th></tr></thead>
            <tbody>
              {[["Reads all your business data","yes","part","part","no"],["Diagnoses problems","yes","no","no","part"],["Predicts outcomes","yes","no","no","no"],["Recommends actions","yes","no","no","part"],["Executes tasks for you","yes","no","no","no"],["Plain-language answers","yes","no","no","yes"]].map((r,i)=>(
                <tr key={i} className="border-b border-border/50">
                  <td className="p-3 font-medium">{r[0]}</td>
                  {r.slice(1).map((c,j)=>(<td key={j} className="p-3">{c==="yes"?<span className="text-success">✓</span>:c==="part"?<span className="text-warning">~</span>:<span className="text-muted-foreground">✕</span>}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="px-6 lg:px-12 pb-16 max-w-5xl mx-auto">
        <h2 className="text-2xl font-semibold text-center mb-8">Built for SME owners</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[{q:"I finally stopped living in spreadsheets. I just ask.",n:"Manufacturing owner"},{q:"It caught a stockout 9 days early and drafted the PO.",n:"Distributor"},{q:"Feels like having a COO I can afford.",n:"D2C founder"}].map((t,i)=>(
            <div key={i} className="rounded-xl border p-5 bg-card"><CheckCircle2 className="h-5 w-5 text-success" /><p className="mt-3 text-sm">“{t.q}”</p><p className="mt-2 text-xs text-muted-foreground">— {t.n}</p></div>
          ))}
        </div>
        <div className="text-center mt-10"><Link href="/pricing" className="rounded-lg bg-primary text-primary-foreground px-6 h-12 inline-flex items-center gap-2 font-medium">Start free — 14 days <ArrowRight className="h-4 w-4" /></Link><div className="mt-3 text-sm text-muted-foreground"><Link href="/help" className="hover:text-foreground underline">Read the FAQ</Link></div></div>
      </section>

      <footer className="px-6 lg:px-12 py-8 border-t text-sm text-muted-foreground flex flex-wrap gap-4 justify-center">
        <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
        <Link href="/status" className="hover:text-foreground">System status</Link>
        <Link href="/changelog" className="hover:text-foreground">Changelog</Link>
        <Link href="/help" className="hover:text-foreground">Help</Link>
        <Link href="/login" className="hover:text-foreground">Sign in</Link>
        <span>© MNB Cortex</span>
      </footer>
    </main>
  );
}
