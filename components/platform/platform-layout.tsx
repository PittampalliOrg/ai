"use client";

import { PlatformTabBar } from "./platform-tab-bar";

interface PlatformLayoutProps {
  children: React.ReactNode;
}

export function PlatformLayout({ children }: PlatformLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      <PlatformTabBar showSidebarToggle />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
