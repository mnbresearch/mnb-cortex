// Static resource articles for the /resources hub (SEO + top-of-funnel).
export type Article = {
  slug: string;
  title: string;
  dek: string;
  readTime: string;
  tag: string;
  sections: { h: string; p: string }[];
};

export const ARTICLES: Article[] = [
  {
    slug: "calculate-cash-runway",
    title: "How to calculate your cash runway (and extend it)",
    dek: "Runway is the single most important number most SME owners can't answer instantly. Here's the math — and five levers to buy yourself more months.",
    readTime: "5 min read",
    tag: "Finance",
    sections: [
      { h: "What runway actually is", p: "Cash runway is how many months your business can keep operating before it runs out of cash, assuming income and spending stay roughly the same. The formula is simple: runway (months) = current cash balance ÷ average monthly net burn. Net burn is your average monthly cash outflow minus inflow. If you hold ₹40 lakh and burn ₹5 lakh a month net, you have eight months." },
      { h: "Why the average trips people up", p: "A single big receipt or a festival-season spike can flatter your average. Use a trailing three-month net burn rather than last month alone, and separate one-off items (a machine purchase, an annual insurance premium) from recurring burn. If you bill in lumpy cycles, model a 13-week cash flow instead of a single average so you can see the low points, not just the mean." },
      { h: "Five levers to extend it", p: "1) Pull receivables in — chase invoices aged 45+ days first, they're where the cash is stuck. 2) Push payables out — negotiate net-45 with suppliers, or take early-payment discounts only when the return beats your cost of capital. 3) Trim dead inventory back into cash. 4) Cut or defer non-essential recurring spend. 5) Line up a credit facility before you need it — the best time to raise is when you don't have to." },
      { h: "How Cortex does this for you", p: "MNB Cortex reads your numbers and shows your live runway, your out-of-cash date, and a 13-week cash-flow forecast — then flags the specific receivables to chase and drafts the reminders. You ask 'what's my runway?' and get a real answer, with the actions attached." },
    ],
  },
  {
    slug: "reduce-dso-get-paid-faster",
    title: "Cut your DSO: a practical guide to getting paid faster",
    dek: "Days Sales Outstanding quietly strangles growing businesses. Here's how to measure it, benchmark it, and bring it down without straining customer relationships.",
    readTime: "6 min read",
    tag: "Cash flow",
    sections: [
      { h: "Measuring DSO", p: "DSO = (accounts receivable ÷ total credit sales) × number of days in the period. If you have ₹30 lakh outstanding on ₹1.8 crore of quarterly credit sales, your DSO is about 45 days. Track it monthly — the trend matters more than the absolute number." },
      { h: "The 80/20 of collections", p: "Most overdue cash sits with a handful of accounts. Sort receivables by age and size, and work the oldest, largest balances first. A weekly 30-minute 'chase-first' routine on the top ten overdue invoices usually recovers more than a blanket reminder to everyone." },
      { h: "Make paying you easy", p: "Send invoices the day work is done, not month-end. Put clear due dates and payment links on every invoice. Offer a small early-payment discount where your margin allows. Set polite, automatic reminders at day 3, day 15 and day 30 so chasing isn't personal — it's just the system." },
      { h: "How Cortex helps", p: "Cortex builds your receivables aging automatically, ranks who to chase first by impact, and drafts the reminder messages for you to approve. It also tracks your DSO over time so you can see the needle move." },
    ],
  },
  {
    slug: "does-an-sme-need-an-ai-coo",
    title: "Does an Indian SME really need an AI COO?",
    dek: "AI COOs are having a moment. Cut through the hype: here's where an AI operating system genuinely moves the needle for a small business — and where it doesn't.",
    readTime: "4 min read",
    tag: "Strategy",
    sections: [
      { h: "The real problem it solves", p: "Most SME owners don't lack data — they lack time and a single view. Numbers live across Tally, spreadsheets, WhatsApp and someone's head. The value of an AI COO isn't 'more dashboards'; it's reading across all of it, spotting what's off, and telling you what to do next in plain language." },
      { h: "Where it pays for itself", p: "Catching a stockout before it costs a sale. Flagging a customer who's about to churn while you can still save them. Seeing a cash crunch three weeks out instead of the morning it hits. Drafting the PO, the reminder, the investor update — so the busywork stops eating your evenings. Each of these is worth far more than a subscription." },
      { h: "Where it doesn't", p: "AI won't replace judgment, relationships, or a broken business model. Treat outputs as a sharp analyst's first draft — review before you act. If your data is a mess, start by connecting one source and let the system learn; you don't need perfect books to begin." },
      { h: "A fair way to decide", p: "Add up the hours you spend each month pulling numbers, chasing payments and writing reports, plus the cost of one avoidable stockout or one late-caught churn. If that's more than a plan costs — and for most growing SMEs it is — the math favours trying it. Start with a free health check and a trial before you commit." },
    ],
  },
];

export const getArticle = (slug: string) => ARTICLES.find((a) => a.slug === slug);
