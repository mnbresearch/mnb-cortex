import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/resources";
import { CALCULATOR_ROUTES } from "@/lib/calculator-seo";
import { INDUSTRY_SLUGS } from "@/lib/industry-seo";
import { DEADLINE_SLUGS } from "@/lib/deadline-seo";

/*
  THE SITEMAP LISTED 21 URLs AND LEFT OUT THE 29 PAGES MOST WORTH FINDING.

  Every calculator is public and returns 200 to an anonymous visitor — but none
  was in here, and all 29 shared the root layout's title. Crawlable and
  indistinguishable, which is the worst of both: the crawl budget is spent and
  nothing ranks.

  Now derived from CALCULATOR_ROUTES rather than typed out again, so adding a
  calculator adds it here. A hand-maintained second list is how the first one
  came to be missing.

  PRIORITIES ARE NOT ALL THE SAME, deliberately.

  A sitemap where everything is 0.7 tells a crawler nothing. The ordering below
  says what this site is actually for:

    1.0   the home page
    0.9   /pricing and /health-check — the two pages a visitor converts on.
          The health check especially: it is now a working receivables
          analyser, not a lead form, so it deserves to be found.
    0.8   the calculators — real tools for real search intent, and the largest
          body of genuinely useful pages here.
    0.6   everything else: legal, status, changelog. Necessary, not the point.

  `changeFrequency` is honest too. Calculators change when a Finance Act does,
  not weekly, and claiming otherwise trains a crawler to ignore the signal.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://cortex.mnbresearch.com";
  const now = new Date();

  const convert = ["/pricing", "/health-check"];
  const marketing = ["", "/features", "/industries", "/compare", "/resources", "/ai-visibility", "/investors", "/contact", "/login", "/dashboard"];
  const support = ["/status", "/changelog", "/help", "/terms", "/privacy", "/refund"];
  const articleRoutes = ARTICLES.map((a) => `/resources/${a.slug}`);

  /*
    THE TWO NEW PROGRAMMATIC SETS, derived from the same arrays the pages
    render from — never a second hand-typed list. That rule is why the
    calculators are here at all: the first version of this file listed 21 URLs
    by hand and omitted all 29 of them.

    Deadlines rank ABOVE industries. "GSTR-3B due date" is asked by every
    business in India every month; "cash flow for a salon" is a much smaller,
    though much better qualified, query. Priority should say which pages we
    expect to earn the traffic.
  */
  const deadlineRoutes = DEADLINE_SLUGS.map((s) => `/deadlines/${s}`);
  const industryRoutes = INDUSTRY_SLUGS.map((s) => `/industries/${s}`);

  const entry = (
    r: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"],
  ): MetadataRoute.Sitemap[number] => ({
    url: base + r,
    lastModified: now,
    changeFrequency,
    priority,
  });

  return [
    entry("", 1, "weekly"),
    ...convert.map((r) => entry(r, 0.9, "weekly")),
    ...CALCULATOR_ROUTES.map((r) => entry(r, 0.8, "monthly")),
    /* Statutory dates change when a Finance Act or a CBIC notification says so
       — "monthly" would train a crawler to ignore the signal. */
    entry("/deadlines", 0.8, "monthly"),
    ...deadlineRoutes.map((r) => entry(r, 0.8, "monthly")),
    ...industryRoutes.map((r) => entry(r, 0.7, "monthly")),
    ...marketing.filter((r) => r !== "").map((r) => entry(r, 0.7, "weekly")),
    ...articleRoutes.map((r) => entry(r, 0.7, "monthly")),
    ...support.map((r) => entry(r, 0.6, "monthly")),
  ];
}
