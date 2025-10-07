"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, Computer } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const current = theme === "system" ? systemTheme : theme;

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const label = `Theme: ${theme}`;

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={label}
      aria-label={label}
      className={[
        "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
        "hover:bg-accent hover:text-accent-foreground",
        compact ? "h-8 w-8 justify-center px-0" : "",
      ].join(" ")}
    >
      {current === "dark" ? (
        <Moon className="h-4 w-4" />
      ) : current === "light" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Computer className="h-4 w-4" />
      )}
      {!compact && <span className="capitalize">{theme}</span>}
    </button>
  );
}
