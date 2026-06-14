export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="p-5 lg:p-7 pb-24 lg:pb-7 space-y-6 max-w-[1400px] mx-auto w-full animate-fade-in">{children}</div>;
}
