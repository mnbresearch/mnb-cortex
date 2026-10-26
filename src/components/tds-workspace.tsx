"use client";

import { useState } from "react";
import { TdsCalc } from "@/components/tds-calc";
import { TdsComplianceView } from "@/components/tds-compliance-view";

export function TdsWorkspace() {
  const [activeTab, setActiveTab] = useState<"calc" | "compliance">("calc");

  return (
    <div className="space-y-6">
      {/* Switcher Navigation */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("calc")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "calc"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          TDS Section Calculator
        </button>
        <button
          onClick={() => setActiveTab("compliance")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "compliance"
              ? "border-primary text-primary font-semibold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>Section 206AB Non-Filer & Challan Defense</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            Rule 30 & 201
          </span>
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === "calc" ? <TdsCalc /> : <TdsComplianceView />}
    </div>
  );
}
