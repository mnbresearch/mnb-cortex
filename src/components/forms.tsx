import { Trash2, Plus, Sparkles } from "lucide-react";
import { deleteRecord } from "@/lib/actions";

const inp = "rounded-lg border bg-background px-3 h-9 text-sm w-full outline-none focus:ring-2 focus:ring-ring";
const btn = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium hover:opacity-90";

export function CollapsibleForm({ title, action, children }: { title: string; action: (fd: FormData) => Promise<void>; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex items-center gap-2 cursor-pointer select-none px-4 py-3 text-sm font-medium">
        <Plus className="h-4 w-4 text-primary" /> {title}
      </summary>
      <form action={action} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 pt-0">
        {children}
        <div className="sm:col-span-2 lg:col-span-3"><button className={btn} type="submit">Save</button></div>
      </form>
    </details>
  );
}

export function Field({ name, label, type = "text", placeholder = "", required = false }: { name: string; label: string; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input className={inp} name={name} type={type} placeholder={placeholder} required={required} step={type === "number" ? "any" : undefined} />
    </label>
  );
}

export function SelectField({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select className={inp} name={name} defaultValue={options[0]}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export function DeleteButton({ table, id, path }: { table: string; id: string; path: string }) {
  return (
    <form action={deleteRecord}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="path" value={path} />
      <button type="submit" title="Delete" className="text-muted-foreground hover:text-danger p-1.5 rounded-md hover:bg-danger/10">
        <Trash2 className="h-4 w-4" />
      </button>
    </form>
  );
}

export function ActionForm({ action, label, primary = false }: { action: () => Promise<void>; label: string; primary?: boolean }) {
  return (
    <form action={action}>
      <button type="submit" className={primary
        ? "inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground h-10 px-4 text-sm font-medium hover:opacity-90"
        : "inline-flex items-center gap-2 rounded-lg border bg-transparent h-10 px-4 text-sm font-medium hover:bg-accent"}>
        <Sparkles className="h-4 w-4" /> {label}
      </button>
    </form>
  );
}
