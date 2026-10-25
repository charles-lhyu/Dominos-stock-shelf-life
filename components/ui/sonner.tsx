"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={(theme as ToasterProps["theme"]) ?? "dark"}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-emerald-300" />,
        info: <InfoIcon className="size-4 text-sky-300" />,
        warning: <TriangleAlertIcon className="size-4 text-amber-300" />,
        error: <OctagonXIcon className="size-4 text-red-300" />,
        loading: <Loader2Icon className="size-4 animate-spin text-stone-300" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "oklch(0.22 0.04 160)",
          "--success-text": "oklch(0.88 0.08 160)",
          "--success-border": "oklch(0.72 0.12 160 / 35%)",
          "--error-bg": "oklch(0.22 0.05 25)",
          "--error-text": "oklch(0.82 0.12 25)",
          "--error-border": "oklch(0.68 0.19 25 / 40%)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast !rounded-xl !border !bg-popover !text-popover-foreground !shadow-lg !shadow-black/40 ring-1 ring-white/10",
          title: "!text-sm !font-medium !text-stone-100",
          description: "!text-xs !text-stone-400",
          closeButton:
            "!border-white/15 !bg-white/10 !text-stone-200 hover:!bg-white/15",
          success:
            "!border-emerald-400/35 !bg-emerald-500/15 !text-emerald-100",
          error: "!border-red-400/35 !bg-red-500/15 !text-red-100",
          warning:
            "!border-amber-400/35 !bg-amber-500/15 !text-amber-100",
          info: "!border-sky-400/35 !bg-sky-500/15 !text-sky-100",
          loading: "!border-white/10 !bg-card !text-stone-200",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
