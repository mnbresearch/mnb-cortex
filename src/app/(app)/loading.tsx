import { SkeletonPage } from "@/components/ui/skeleton";

/**
 * Shown while any in-app route is fetching on the server.
 *
 * This used to be a centred logo with "Reading your business…", which meant
 * every navigation blanked the content area and then repainted it — the screen
 * flashed, and nothing about the loading state told you where you were going.
 *
 * A skeleton of the destination is better on both counts: the layout is already
 * in place when the data lands, so nothing jumps, and the page reads as "nearly
 * here" rather than "gone". The navigation progress bar at the top of the
 * window carries the sense of motion.
 */
export default function Loading() {
  return <SkeletonPage />;
}
