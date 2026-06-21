"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/focus", label: "Focus" },
  { href: "/tracker", label: "Tracker" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/calendar", label: "Calendar" },
  { href: "/insights", label: "Insights" },
  { href: "/journal", label: "Journal" },
  { href: "/goals", label: "Goals" },
  { href: "/review", label: "Review" },
  { href: "/expenses", label: "Expenses" },
  { href: "/jobs", label: "Jobs" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="dot" />
        Habit Ledger
      </div>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={"nav-link" + (path === l.href ? " active" : "")}>
          {l.label}
        </Link>
      ))}
      <ThemeToggle />
      <div className="foot">Habit Ledger</div>
    </aside>
  );
}
