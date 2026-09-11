const path=require("path"), fs=require("fs");
const R=process.env.CORTEX_ROOT || path.resolve(__dirname, "..");
const {PGlite}=require(path.join(R,"node_modules/@electric-sql/pglite"));

/* Strip SQL comments, then split on ';' — robust against prose containing
   the word "select", which is what broke the first version of this harness. */
function statements(sql){
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g,"").replace(/^\s*--.*$/gm,"");
  return clean.split(";").map(s=>s.trim()).filter(Boolean);
}

(async()=>{
  const sql=fs.readFileSync(path.join(R,"supabase/RUN-NOW-invoice-columns.sql"),"utf8");
  const st=statements(sql);
  const apply=st.filter(s=>/^(alter|update|create)/i.test(s));
  const checks=st.filter(s=>/^select/i.test(s));
  if(apply.length!==4) throw new Error("expected 4 apply statements, got "+apply.length);
  if(checks.length!==2) throw new Error("expected 2 verify queries, got "+checks.length);

  const db=new PGlite();
  await db.exec(`create table invoices (
    id uuid primary key default gen_random_uuid(), org_id uuid,
    invoice_no text, party text, amount numeric,
    created_at timestamptz not null default now() - interval '40 days');`);
  await db.exec(`insert into invoices (org_id, invoice_no) values (gen_random_uuid(),'INV-1'),(gen_random_uuid(),'INV-2');`);

  /* The columns check must report MISSING, not throw, on an unapplied schema. */
  const before=(await db.query(checks[0])).rows[0];
  console.log("BEFORE:", JSON.stringify(before));
  if(before.invoices_meta!=="MISSING"||before.invoices_issue_date!=="MISSING"||before.ageing_index!=="MISSING")
    throw new Error("verify passes on an unapplied schema");

  for(const s of apply) await db.query(s);
  const after=(await db.query(checks[0])).rows[0];
  console.log("AFTER :", JSON.stringify(after));
  if(Object.values(after).some(v=>v!=="ok")) throw new Error("did not apply cleanly");

  const u=(await db.query(checks[1])).rows[0];
  if(Number(u.invoices_still_undated)!==0) throw new Error("backfill did not run: "+JSON.stringify(u));
  console.log("backfilled, undated =", u.invoices_still_undated);

  /* A real invoice date must survive a second run. */
  await db.query(`update invoices set issue_date='2020-01-15' where invoice_no='INV-1'`);
  for(const s of apply) await db.query(s);
  const kept=(await db.query(`select issue_date::text as d from invoices where invoice_no='INV-1'`)).rows[0].d;
  if(!String(kept).startsWith("2020-01-15")) throw new Error("re-run overwrote a real date: "+kept);
  console.log("re-run kept the real date:", kept);
  console.log("\nOK — applies twice, backfills only nulls, verify reports MISSING rather than erroring.");
})().catch(e=>{console.error("FAILED:",e.message);process.exit(1)});
