import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt = "MNB Cortex — The AI operating brain for your business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#04201d,#0a3a34)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#12b5a0,#1ec98a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 800, color: "#04201d" }}>C</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>MNB Cortex</div>
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, marginTop: 44, lineHeight: 1.05, letterSpacing: -2 }}>Your business now has a brain of its own.</div>
        <div style={{ fontSize: 30, color: "#8fd8cc", marginTop: 26 }}>One AI operating brain for your whole company — it reads everything, remembers everything, and acts.</div>
      </div>
    ), { ...size }
  );
}
