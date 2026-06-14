"use client";
import { Sparkles, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, statusBg } from "@/lib/utils";
import type { AIInsight } from "@/types";

export function InsightCard({ ins }: { ins: AIInsight }) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-lg p-2 border", statusBg[ins.severity])}>
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium leading-snug">{ins.title}</p>
            <Badge className="text-muted-foreground border-border shrink-0">{Math.round(ins.confidence * 100)}% conf.</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{ins.detail}</p>
          <div className="mt-3 space-y-1.5">
            {ins.recommended_actions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
