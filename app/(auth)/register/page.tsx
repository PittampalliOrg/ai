"use client";

import { redirect } from "next/navigation";

// Registration is no longer needed - redirect to login for GitHub OAuth
export default function Page() {
  redirect("/login");
}
