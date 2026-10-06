/*
  READ EVERY ROW, NOT THE FIRST THOUSAND.

  PostgREST caps a response at the project's max-rows (1000 on Supabase by
  default) whatever .limit() asks for, and says nothing when it does. A query
  that loads a workspace's invoices and filters in JS therefore silently works
  on a subset once the workspace is busy — the totals look plausible and are
  wrong. This walks .range() pages until a short page arrives or `max` is hit,
  and reports whether it stopped early so the caller can say so.
*/
export type PageResult<T> = { rows: T[]; truncated: boolean; error: string | null };

export async function pageAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts: { per?: number; max?: number } = {},
): Promise<PageResult<T>> {
  const per = Math.max(1, Math.min(opts.per ?? 1000, 1000));
  const max = opts.max ?? 20_000;
  const rows: T[] = [];
  for (let from = 0; from < max; from += per) {
    const { data, error } = await page(from, Math.min(from + per, max) - 1);
    if (error) return { rows, truncated: true, error: error.message };
    const got = data || [];
    rows.push(...got);
    if (got.length < per) return { rows, truncated: false, error: null };
  }
  return { rows, truncated: true, error: null };
}
