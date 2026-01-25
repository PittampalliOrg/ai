/**
 * Stream Test Page
 *
 * Full-page dashboard for testing and debugging workflow streaming events.
 * Navigate to /stream-test to access.
 */

import { StreamDashboard } from "@/components/stream-test/stream-dashboard";

export const metadata = {
  title: "Stream Test Dashboard",
  description: "Real-time visualization of workflow streaming events",
};

export default function StreamTestPage() {
  return <StreamDashboard />;
}
