import {
  LayoutDashboard, MessageSquare, TrendingUp, Wallet, Factory, Boxes,
  Users, Globe, Brain, FileText, Video, Workflow, Shield, Settings
} from "lucide-react";

export const NAV = [
  { href: "/dashboard", label: "Business Health", icon: LayoutDashboard, group: "Overview" },
  { href: "/chat", label: "AI CEO Chat", icon: MessageSquare, group: "Overview" },
  { href: "/sales", label: "Sales", icon: TrendingUp, group: "Intelligence" },
  { href: "/finance", label: "Finance", icon: Wallet, group: "Intelligence" },
  { href: "/production", label: "Production", icon: Factory, group: "Intelligence" },
  { href: "/inventory", label: "Inventory", icon: Boxes, group: "Intelligence" },
  { href: "/hr", label: "HR", icon: Users, group: "Intelligence" },
  { href: "/market", label: "Market", icon: Globe, group: "Intelligence" },
  { href: "/strategy", label: "Strategy Consultant", icon: Brain, group: "Advisory" },
  { href: "/documents", label: "Documents", icon: FileText, group: "Advisory" },
  { href: "/meetings", label: "Meetings", icon: Video, group: "Advisory" },
  { href: "/workflows", label: "Workflows", icon: Workflow, group: "Automation" },
  { href: "/admin", label: "Admin & Access", icon: Shield, group: "Automation" },
  { href: "/settings", label: "Settings", icon: Settings, group: "Automation" },
] as const;
