"use client";
import Link from "next/link";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground max-w-sm">An unexpected error occurred. Try again, or head back to your dashboard.</p>
        <div className="mt-6 flex gap-2 justify-center">
          <button onClick={reset} className="rounded-lg bg-primary text-primary-foreground px-5 h-11 inline-flex items-center font-medium">Try again</button>
          <Link href="/dashboard" className="rounded-lg border px-5 h-11 inline-flex items-center font-medium">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
