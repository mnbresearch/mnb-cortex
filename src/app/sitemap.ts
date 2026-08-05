import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/resources";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://cortex.mnbresearch.com";
  const routes = ["", "/features", "/industries", "/compare", "/resources", "/ai-visibility", "/health-check", "/pricing", "/status", "/changelog", "/help", "/terms", "/privacy", "/refund", "/contact", "/login", "/dashboard"];
  const articleRoutes = ARTICLES.map((a) => `/resources/${a.slug}`);
  return [...routes, ...articleRoutes].map((r) => ({ url: base + r, lastModified: new Date(), changeFrequency: "weekly", priority: r === "" ? 1 : 0.7 }));
}
