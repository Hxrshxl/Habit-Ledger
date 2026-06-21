"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const sys   = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(saved ? saved === "dark" : sys);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="nav-link"
      style={{ textAlign: "left", width: "100%", border: "none", background: "none", cursor: "pointer" }}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "☀ Light mode" : "◑ Dark mode"}
    </button>
  );
}
