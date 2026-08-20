/**
 * Standard in-app page wrapper.
 *
 * `page-stagger` gives the page's top-level sections a sequenced entrance
 * rather than fading the entire screen in as one block — the eye lands on the
 * first card while the rest settle, which makes a data-dense page feel ordered
 * instead of dumped. It's CSS so it runs on the first paint, before hydration,
 * and keeps this a server component.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5 lg:p-7 pb-24 lg:pb-7 space-y-6 max-w-[1400px] mx-auto w-full page-stagger">
      {children}
    </div>
  );
}
