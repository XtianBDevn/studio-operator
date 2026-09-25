import Link from "next/link"
import { Plus } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { PRODUCT_GUARDRAILS } from "@/lib/guardrails"
import { cn } from "@/lib/utils"

export function AppHeader({
  mode,
  model,
  analysisProvider,
}: {
  mode: "mock" | "live"
  model: string
  analysisProvider: "mock" | "openai"
}) {
  return (
    <header className="border-b bg-card/80">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 py-3 md:px-6">
        <Link href="/" className="min-w-0">
          <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Studio Operator
          </p>
          <p className="truncate text-sm">Production desk</p>
        </Link>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground md:block">
            {analysisProvider === "openai" ? "Astra live" : "Astra mock"} · {model}
            {mode === "live" ? " · Higgsfield live" : " · Higgsfield mock"}
          </p>
          <Link href="/record" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
            Recording
          </Link>
          <Link href="/connection" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
            Connection
          </Link>
          <Link href="/jobs/new" className={cn(buttonVariants({ size: "sm" }))}>
            <Plus />
            New Job
          </Link>
        </div>
      </div>
    </header>
  )
}

export function AppFooter() {
  return (
    <footer className="border-t px-4 py-4 md:px-6">
      <p className="mx-auto w-full max-w-[1440px] text-xs leading-5 text-muted-foreground">
        {PRODUCT_GUARDRAILS.statement}
      </p>
    </footer>
  )
}
