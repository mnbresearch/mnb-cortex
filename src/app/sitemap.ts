import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://mnb-cortex.vercel.app";
  const routes = ["", "/pricing", "/status", "/changelog", "/help", "/login", "/dashboard"];
  return routes.map((r) => ({ url: base + r, lastModified: new Date(), changeFrequency: "weekly", priority: r === "" ? 1 : 0.7 }));
}
