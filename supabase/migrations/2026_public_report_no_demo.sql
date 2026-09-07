/* ===========================================================================
   The public share link must never publish sample data as the company's own.

   THE PROBLEM

   /r/<token> renders "<Company Name> — Business Snapshot" with no date
   anywhere, and public_report() selected from health_metrics and ai_insights
   with no is_demo filter. So a workspace that had clicked "Load a sample
   dataset" — which is the first thing a new customer is invited to do — could
   create a share link and send it to a banker, an investor or a buyer, and
   they would see ₹4.25 Cr revenue, ₹51 L net profit and 31% gross margin
   presented under the real company name, indistinguishable from live figures.

   Every other surface in the product knows the difference: the recompute
   sweep, the insight sweep and now the KPI card all key off is_demo. The one
   surface that leaves the building did not.

   ALSO FIXED HERE

   `select jsonb_agg(...) from ai_insights where org_id = v_org limit 4` does
   not limit anything. The LIMIT applies to the aggregate's single output row,
   not to the rows going into it, so every insight was published rather than
   four. The limit now sits in a subquery where it does something.

   And `as_of` is returned so the page can date the snapshot. The figures were
   already stamped in the database; the reader was simply never shown it.
   =========================================================================== */

create or replace function public.public_report(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_name text; v_metrics jsonb; v_insights jsonb; v_as_of date;
begin
  select org_id into v_org from report_links where token = p_token;
  if v_org is null then return jsonb_build_object('ok', false); end if;
  select name into v_name from organizations where id = v_org;

  /* coalesce(): rows written before is_demo existed have NULL, and NULL is not
     false. Treating an unknown provenance as demo would blank real snapshots;
     these rows predate the sample dataset, so real is the correct reading. */
  select jsonb_agg(jsonb_build_object(
           'label', label, 'value', value, 'unit', unit,
           'delta_pct', delta_pct, 'status', status, 'as_of', as_of))
    into v_metrics
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select max(as_of) into v_as_of
    from health_metrics
   where org_id = v_org and coalesce(is_demo, false) = false;

  select jsonb_agg(jsonb_build_object('title', title, 'detail', detail, 'severity', severity))
    into v_insights
    from (
      select title, detail, severity
        from ai_insights
       where org_id = v_org and coalesce(is_demo, false) = false
       order by created_at desc
       limit 4
    ) i;

  return jsonb_build_object(
    'ok', true,
    'company', coalesce(v_name, 'Company'),
    'as_of', v_as_of,
    'metrics', coalesce(v_metrics, '[]'::jsonb),
    'insights', coalesce(v_insights, '[]'::jsonb));
end $$;

grant execute on function public.public_report(text) to anon, authenticated;
