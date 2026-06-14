import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
export function Section({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div><CardTitle>{title}</CardTitle>{desc && <CardDescription>{desc}</CardDescription>}</div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
