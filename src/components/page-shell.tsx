/**
 * Standard in-app page wrapper.
 *
 * `page-stagger` gives the page's top-level sections a sequenced entrance
 * rather than fading the entire screen in as one block — the eye lands on the
 * first card while the rest settle, which makes a data-dense page feel ordered
 * instead of dumped. It's CSS so it runs on the first paint, before hydration,
 * and keeps this a server component.
 */
/*
 * `<main id="main">`, and it matters more than it looks.
 *
 * The authenticated app had no <main> anywhere — the public pages had one, the
 * 90-odd app pages did not. The sidebar renders around 122 links, so with no
 * landmark and no skip link a keyboard or screen-reader user had to tab through
 * every one of them on EVERY page load to reach the content. There was nothing
 * to jump to. WCAG 2.4.1.
 *
 * `tabIndex={-1}` so the skip link in the layout can move focus here
 * programmatically without adding it to the natural tab order.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="p-5 lg:p-7 pb-24 lg:pb-7 space-y-6 max-w-[1400px] mx-auto w-full page-stagger focus:outline-none"
    >
      {children}
    </main>
  );
}
