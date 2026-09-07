export type Status = "green" | "yellow" | "red";

export interface HealthMetric {
  id: string; metric_key: string; label: string; value: number;
  // null = no prior period to compare against. Renderers must show that as
  // "no comparison", never as a 0% change — see the note in lib/metrics.ts.
  unit: string; delta_pct: number | null; status: Status; trend: number[];
  is_demo?: boolean;
}
export interface AIInsight {
  id: string; module: string; severity: Status; title: string;
  detail: string; confidence: number; recommended_actions: string[];
}
export interface Alert {
  id: string; severity: Status; title: string; body: string; module: string; is_read: boolean; created_at: string;
}
export interface ChatMessage { id?: string; role: "user" | "assistant" | "system"; content: string; meta?: any; }
