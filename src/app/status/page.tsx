import Link from "next/link";
import { StatusBoard } from "@/components/status-board";
export const metadata = { title: "System Status — MNB Cortex" };
export const dynamic = "force-dynamic";
export default function Status() {
  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-12 h-16 border-b">
        <Link href="/" className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-primary grid place-items-center text-primary-foreground font-bold">C</div><span className="font-semibold">MNB Cortex</span></Link>
        <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
      </header>
      <section className="px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-center mb-2">System Status</h1>
        <p className="text-muted-foreground text-center mb-8">Live status of MNB Cortex services.</p>
        <StatusBoard />
      </section>
    </main>
  );
}
