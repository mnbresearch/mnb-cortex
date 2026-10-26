"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Check,
  Loader2,
  Calendar,
  Lock,
  ShieldCheck,
  Building2,
  Layers,
  Coins,
  Send,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import {
  DEMO_FEATURE_CATALOGUE,
  DEMO_PRESETS,
  type DemoPresetId,
  DEMO_DEFAULT_STARTING_CREDITS,
  DEMO_TRIAL_DURATION_DAYS,
} from "@/lib/demo-workspace";

const INPUT = "rounded-lg border bg-background px-3 h-10 text-sm outline-none focus:ring-2 focus:ring-ring";

export function SuperAdminDemoCreator({ className }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("general");
  const [credits, setCredits] = useState(String(DEMO_DEFAULT_STARTING_CREDITS));
  const [selectedPreset, setSelectedPreset] = useState<DemoPresetId>("enterprise_full");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    DEMO_PRESETS[0].featureIds
  );
  const [preSeedData, setPreSeedData] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);

  function handlePresetSelect(presetId: DemoPresetId) {
    setSelectedPreset(presetId);
    if (presetId === "custom") return;
    const preset = DEMO_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setSelectedFeatures([...preset.featureIds]);
    }
  }

  function toggleFeature(featureId: string) {
    setSelectedPreset("custom");
    if (selectedFeatures.includes(featureId)) {
      setSelectedFeatures(selectedFeatures.filter((id) => id !== featureId));
    } else {
      setSelectedFeatures([...selectedFeatures, featureId]);
    }
  }

  function selectAll() {
    setSelectedPreset("enterprise_full");
    setSelectedFeatures(DEMO_FEATURE_CATALOGUE.map((f) => f.id));
  }

  function clearAll() {
    setSelectedPreset("custom");
    setSelectedFeatures([]);
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setBusy(true);
    setRes(null);

    try {
      const resp = await fetch("/api/superadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "provisionDemo",
          email: email.trim(),
          name: name.trim() || undefined,
          company: company.trim() || undefined,
          industry,
          preset: selectedPreset,
          features: selectedFeatures,
          credits: Number(credits) || DEMO_DEFAULT_STARTING_CREDITS,
          durationDays: DEMO_TRIAL_DURATION_DAYS,
          preSeedData,
        }),
      });

      const data = await resp.json();
      setRes(data);
      if (data.ok) {
        setTimeout(() => location.reload(), 3000);
      }
    } catch (err: any) {
      setRes({ ok: false, error: err?.message || "Failed to provision demo workspace." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Provision Custom 7-Day Demo Workspace
              </CardTitle>
              <CardDescription>
                Tailored feature matrix &bull; Strictly valid for 7 days &bull; Compulsory plan upgrade upon expiry
              </CardDescription>
            </div>
          </div>
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-xs flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" /> 7-Day Hard Limit
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={handleProvision} className="space-y-4">
          {/* Recipient Details */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">
                Prospect / Customer Email <span className="text-danger">*</span>
              </label>
              <input
                required
                type="email"
                placeholder="founder@sme.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${INPUT} w-full`}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Contact Name</label>
              <input
                placeholder="e.g. Rajesh Kumar"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${INPUT} w-full`}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Company / Workspace</label>
              <input
                placeholder="e.g. Apex Engineering"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className={`${INPUT} w-full`}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Industry Sector</label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={`${INPUT} w-full`}
              >
                <option value="general">General Business</option>
                <option value="manufacturing">Manufacturing &amp; Engineering</option>
                <option value="retail-d2c">Retail &amp; D2C</option>
                <option value="services">Professional Services &amp; Agency</option>
                <option value="distribution">Wholesale &amp; Distribution</option>
                <option value="tech-saas">Tech &amp; SaaS</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Starting AI Credits</label>
              <select
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className={`${INPUT} w-full font-mono`}
              >
                <option value="1000">1,000 Credits (Essential)</option>
                <option value="2500">2,500 Credits (Standard Demo)</option>
                <option value="5000">5,000 Credits (High Evaluation)</option>
                <option value="10000">10,000 Credits (Enterprise Pilot)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Evaluation Period</label>
              <div className="h-10 rounded-lg border bg-muted/30 px-3 flex items-center justify-between text-xs font-medium text-foreground">
                <span className="flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-amber-600" /> Exactly 7 Days
                </span>
                <span className="text-[11px] text-muted-foreground">Compulsory Upgrade</span>
              </div>
            </div>
          </div>

          {/* Quick Demo Presets */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-primary" /> Select Demo Package Preset
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select All
                </button>
                <span className="text-muted-foreground text-xs">&bull;</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[11px] text-muted-foreground hover:underline"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {DEMO_PRESETS.filter((p) => p.id !== "custom").map((preset) => {
                const isActive = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset.id)}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/40 bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground">{preset.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{preset.badge}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature Matrix Checkboxes */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold text-foreground block">
              Configured Feature Set ({selectedFeatures.length} of {DEMO_FEATURE_CATALOGUE.length} Selected)
            </span>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3 rounded-lg border bg-muted/10 max-h-64 overflow-y-auto">
              {DEMO_FEATURE_CATALOGUE.map((f) => {
                const checked = selectedFeatures.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className={`flex items-start gap-2 p-2 rounded cursor-pointer border text-xs transition-colors ${
                      checked
                        ? "bg-background border-primary/40 shadow-xs"
                        : "bg-background/40 border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFeature(f.id)}
                      className="mt-0.5 rounded border-input text-primary focus:ring-primary"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-foreground flex items-center gap-1">
                        {f.name}
                      </div>
                      <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                        {f.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Realistic Data Pre-seed Toggle */}
          <div className="rounded-lg border p-3 bg-muted/20 flex items-center justify-between text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={preSeedData}
                onChange={(e) => setPreSeedData(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground">
                Pre-seed with realistic Indian SME business data
              </span>
            </label>
            <span className="text-[11px] text-muted-foreground">
              Invoices, overdue 43B(h) bills, GST figures
            </span>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              An activation email detailing the {selectedFeatures.length} configured modules will be sent automatically.
            </div>
            <Button disabled={busy || !email || selectedFeatures.length === 0} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? "Provisioning Demo…" : "Provision 7-Day Demo Workspace"}
            </Button>
          </div>

          {/* Feedback Display */}
          {res && (
            <div
              className={`text-xs rounded-lg border p-3 ${
                res.ok
                  ? "border-success/30 bg-success/5 text-foreground"
                  : "border-danger/30 bg-danger/5 text-danger"
              }`}
            >
              {res.ok ? (
                <div className="space-y-1">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Demo Workspace &ldquo;{res.orgName}&rdquo; Successfully Created!
                  </div>
                  <div>
                    &bull; <b>{res.featuresCount} modules</b> enabled &bull; <b>{Number(res.credits).toLocaleString("en-IN")} AI credits</b> &bull; Valid until <b>{new Date(res.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b>.
                  </div>
                  <div className="text-muted-foreground">
                    {res.emailed
                      ? "Official branded activation email sent with 7-day validity notice."
                      : "Workspace ready — activation email not sent (check SMTP configuration)."}
                  </div>
                </div>
              ) : (
                <div>Error: {res.error || "Provisioning failed."}</div>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
