export default function Loading() {
  return (
    <div className="p-5 lg:p-7 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-secondary" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-secondary" />)}
      </div>
      <div className="h-64 rounded-xl bg-secondary" />
    </div>
  );
}
