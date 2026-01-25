"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Workflow,
  FileText,
  GitBranch,
  Radio,
  Database,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarToggle } from "@/components/sidebar-toggle";

const platformTabs = [
  { href: "/dapr-workflows", label: "Workflows", icon: Workflow },
  { href: "/workflow-patterns", label: "Patterns", icon: Boxes },
  { href: "/api-logs", label: "API Logs", icon: FileText },
  { href: "/call-graph", label: "Call Graph", icon: GitBranch },
  { href: "/pub-sub", label: "Pub/Sub", icon: Radio },
  { href: "/kv-store", label: "KV Store", icon: Database },
];

interface PlatformTabBarProps {
  className?: string;
  showSidebarToggle?: boolean;
}

export function PlatformTabBar({ className, showSidebarToggle }: PlatformTabBarProps) {
  const pathname = usePathname();

  const isActiveTab = (href: string) => {
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <div
      className={cn(
        "border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        className
      )}
    >
      <nav className="flex items-center gap-1 px-2 overflow-x-auto">
        {showSidebarToggle && <SidebarToggle />}
        {platformTabs.map((tab) => {
          const isActive = isActiveTab(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                "border-b-2 -mb-px",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
