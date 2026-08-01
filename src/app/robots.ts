import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/r/"] },
    sitemap: "https://cortex.mnbresearch.com/sitemap.xml",
  };
}
