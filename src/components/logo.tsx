// Animated "living intelligence" mark for MNB Cortex.
// A neural core inside a rounded badge: the core breathes, a ring pulses,
// and a spark orbits — signalling an always-on partner watching your business.
export function Logo({ size = 34, animated = true, className = "" }: { size?: number; animated?: boolean; className?: string }) {
  const uid = "cx"; // single gradient def id is fine per-page
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} role="img" aria-label="MNB Cortex">
      <defs>
        <linearGradient id={`${uid}-grad`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(178 74% 38%)" />
          <stop offset="55%" stopColor="hsl(168 72% 40%)" />
          <stop offset="100%" stopColor="hsl(158 74% 42%)" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" fill={`url(#${uid}-grad)`} />
      <rect x="1.5" y="1.5" width="37" height="37" rx="11.5" fill={`url(#${uid}-glow)`} />

      {/* breathing ring */}
      <circle cx="20" cy="20" r="12.5" fill="none" stroke="white" strokeOpacity="0.28" strokeWidth="1.3">
        {animated && <animate attributeName="r" values="12;13.6;12" dur="3.6s" repeatCount="indefinite" />}
        {animated && <animate attributeName="stroke-opacity" values="0.3;0.08;0.3" dur="3.6s" repeatCount="indefinite" />}
      </circle>

      {/* the C arc */}
      <path d="M26.4 13.4a8.6 8.6 0 1 0 0 13.2" fill="none" stroke="white" strokeWidth="2.7" strokeLinecap="round" />

      {/* neural core */}
      <circle cx="20" cy="20" r="3" fill="white">
        {animated && <animate attributeName="r" values="2.7;3.9;2.7" dur="2.2s" repeatCount="indefinite" />}
      </circle>

      {/* orbiting spark */}
      <circle r="1.5" fill="white" fillOpacity="0.95">
        {animated && <animateMotion dur="4.5s" repeatCount="indefinite" path="M20,20 m -8.6,0 a 8.6,8.6 0 1,0 17.2,0 a 8.6,8.6 0 1,0 -17.2,0" />}
      </circle>
    </svg>
  );
}
