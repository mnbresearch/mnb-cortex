import Link from "next/link";
export const metadata = { title: "Offline — MNB Cortex" };
export default function Offline() {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <div className="h-14 w-14 rounded-2xl bg-primary/15 grid place-items-center mx-auto text-primary text-2xl font-bold">C</div>
        <h1 className="mt-4 text-2xl font-semibold">You're offline</h1>
        <p className="mt-2 text-muted-foreground max-w-sm">MNB Cortex needs a connection for live data. Reconnect and try again — your installed app will pick up right where you left off.</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-lg bg-primary text-primary-foreground px-5 h-11 items-center font-medium">Retry</Link>
      </div>
    </main>
  );
}
