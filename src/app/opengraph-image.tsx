import { ImageResponse } from "next/og";
export const runtime = "edge";
export const alt = "MNB Cortex — The AI COO for SMEs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OG() {
  return new ImageResponse(
    (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(135deg,#0b1020,#1a1440)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#635bff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, fontWeight: 800 }}>C</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>MNB Cortex</div>
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, marginTop: 40, lineHeight: 1.1 }}>The AI COO for SMEs</div>
        <div style={{ fontSize: 32, color: "#b8b8d0", marginTop: 24 }}>Monitor · Predict · Recommend · Execute — run your company by asking.</div>
      </div>
    ), { ...size }
  );
}
