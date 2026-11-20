import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt = "MNB Cortex — Agents that run the work. You make the calls.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* The share card, in the MNB Cortex brand: near-black, one gold accent, heavy
   sans with the last word set as the gold emphasis (the brand kit's signature;
   the edge renderer has no italic serif, so weight and colour carry it). */
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: "radial-gradient(ellipse at 50% 0%, #2a2211 0%, #0b0b0c 62%)", color: "#ededef", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#e2c27a,#b8862f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 800, color: "#0b0b0c" }}>C</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, color: "#9a9aa4" }}>MNB</div>
            <div style={{ fontSize: 40, fontWeight: 800 }}>Cortex</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
          <div>Agents that run the work.</div>
          <div style={{ display: "flex" }}>You make the&nbsp;<span style={{ color: "#c9a24a" }}>calls.</span></div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: "#9a9aa4" }}>
          <div>The agent workspace for finance and operations teams</div>
          <div style={{ color: "#c9a24a" }}>mnbcortex.app</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
