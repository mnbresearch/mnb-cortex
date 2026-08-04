import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://cortex.mnbresearch.com";
  const routes = ["", "/features", "/industries", "/health-check", "/pricing", "/status", "/changelog", "/help", "/terms", "/privacy", "/refund", "/contact", "/login", "/dashboard"];
  return routes.map((r) => ({ url: base + r, lastModified: new Date(), changeFrequency: "weekly", priority: r === "" ? 1 : 0.7 }));
}
