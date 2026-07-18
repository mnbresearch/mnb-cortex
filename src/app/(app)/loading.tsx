import { Logo } from "@/components/logo";

export default function Loading() {
  return (
    <div className="relative min-h-[70vh] grid place-items-center overflow-hidden">
      <div className="aurora" aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-4 animate-scale-in">
        <div className="animate-float"><Logo size={64} /></div>
        <div className="text-center">
          <div className="font-semibold tracking-tight">MNB Cortex</div>
          <div className="text-sm text-muted-foreground">Reading your business…</div>
        </div>
        <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-full brand-gradient rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}
