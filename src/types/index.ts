export type Status = "green" | "yellow" | "red";

export interface HealthMetric {
  id: string; metric_key: string; label: string; value: number;
  unit: string; delta_pct: number; status: Status; trend: number[];
}
export interface AIInsight {
  id: string; module: string; severity: Status; title: string;
  detail: string; confidence: number; recommended_actions: string[];
}
export interface Alert {
  id: string; severity: Status; title: string; body: string; module: string; is_read: boolean; created_at: string;
}
export interface ChatMessage { id?: string; role: "user" | "assistant" | "system"; content: string; meta?: any; }
