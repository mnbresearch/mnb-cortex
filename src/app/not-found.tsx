import Link from "next/link";
export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center px-6 text-center">
      <div>
        <div className="h-14 w-14 rounded-2xl bg-primary/15 grid place-items-center mx-auto text-primary text-2xl font-bold">C</div>
        <h1 className="mt-4 text-3xl font-semibold">Page not found</h1>
        <p className="mt-2 text-muted-foreground">That page doesn&apos;t exist. Your AI COO is still on the job.</p>
        <div className="mt-6 flex gap-2 justify-center">
          <Link href="/dashboard" className="rounded-lg bg-primary text-primary-foreground px-5 h-11 inline-flex items-center font-medium">Go to dashboard</Link>
          <Link href="/" className="rounded-lg border px-5 h-11 inline-flex items-center font-medium">Home</Link>
        </div>
      </div>
    </main>
  );
}
