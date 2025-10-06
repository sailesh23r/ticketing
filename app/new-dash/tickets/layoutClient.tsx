"use client";
import React from "react";
import { usePathname } from "next/navigation";

export default function LayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDetail = /\/new-dash\/tickets\/.+/.test(pathname || "");
  // For ticket detail pages, render content without sidebar
  if (isDetail) return <div className="w-full">{children}</div>;

  // Non-detail pages (e.g., list) – existing implementation kept minimal
  return <div className="w-full">{children}</div>;
}
