"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/focus", label: "Focus" },
  { href: "/tracker", label: "Tracker" },
  { href: "/heatmap", label: "Heatmap" },
  { href: "/insights", label: "Insights" },
  { href: "/goals", label: "Goals" },
  { href: "/review", label: "Review" },
  { href: "/expenses", label: "Expenses" },
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
      <div className="foot">Local-first · SQLite</div>
    </aside>
  );
}
