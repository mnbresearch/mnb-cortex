"use client";

import { useState } from "react";
import { ItcSetoff } from "@/components/itc-setoff";
import { ItcReconciliationView } from "@/components/itc-reconciliation-view";

export function ItcWorkspace() {
  const [activeTab, setActiveTab] = useState<"setoff" | "reconcile">("setoff");

  return (
    <div className="space-y-6">
      {/* Switcher Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("setoff")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "setoff"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          ITC Set-off Calculator (Rule 88A)
        </button>
        <button
          onClick={() => setActiveTab("reconcile")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "reconcile"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>GSTR-2B Auto-Reconciliation</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Rule 37A
          </span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "setoff" ? <ItcSetoff /> : <ItcReconciliationView />}
    </div>
  );
}
