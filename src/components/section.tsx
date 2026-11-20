import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
/* `id` lets another page link straight to a section (e.g. /settings#company-knowledge-connections). */
export function Section({ title, desc, children, right, id }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <Card id={id} className={id ? "scroll-mt-20" : undefined}>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div><CardTitle>{title}</CardTitle>{desc && <CardDescription>{desc}</CardDescription>}</div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
