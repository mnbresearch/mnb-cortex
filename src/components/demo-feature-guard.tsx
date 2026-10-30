"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { demoRouteAllowed } from "@/lib/demo-workspace";

/*
  Keeps a demo workspace to the features a super-admin provisioned it with.

  This is a presentation gate for a sales demo, not a security boundary — the
  demo already runs on a paid-tier workspace with its own data and credits, and
  nothing here protects another tenant. Its job is that what the prospect sees
  matches what was promised to them, and that anything outside the demo reads
  as "part of the full plan" rather than silently being there.
*/
export function DemoFeatureGuard({ features }: { features: string[] | null | undefined }) {
  const path = usePathname();
  if (demoRouteAllowed(features, path)) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="demo-guard-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="max-w-md w-full rounded-2xl border bg-card p-6 shadow-xl text-center space-y-3">
        <Lock className="h-6 w-6 mx-auto text-muted-foreground" aria-hidden />
        <h2 id="demo-guard-title" className="text-lg font-semibold">Not part of this demo</h2>
        <p className="text-sm text-muted-foreground">
          This feature is included in the full Cortex plans. Your demo was set up with a selected set of features.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm">Back to dashboard</Link>
          <Link href="/pricing" className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">See plans</Link>
        </div>
      </div>
    </div>
  );
}
