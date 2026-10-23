import type { ReactNode } from "react";
import { cn } from "cn";
import type { StockStatus } from "@/lib/types";

const TONE: Record<StockStatus, string> = {
  expired: "bg-red-700 text-white",
  today: "bg-orange-600 text-white",
  critical: "bg-amber-400 text-amber-950",
  soon: "bg-amber-100 text-amber-950 ring-1 ring-amber-300",
  watch: "bg-sky-100 text-sky-950 ring-1 ring-sky-200",
  ok: "bg-emerald-700 text-white",
  missing: "bg-stone-200 text-stone-700",
};

export function StatusPill({
  status,
  children,
  className,
}: {
  status: StockStatus;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide uppercase",
        TONE[status],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function statusPanel(status: StockStatus): string {
  if (status === "expired") return "bg-red-700 text-white";
  if (status === "today") return "bg-orange-600 text-white";
  if (status === "critical") return "bg-amber-400 text-amber-950";
  return "bg-white text-stone-950";
}
