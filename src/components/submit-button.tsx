"use client"

import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"

export function SubmitButton({
  children,
  pendingLabel = "Working…",
  variant = "default",
  name,
  value,
}: {
  children: React.ReactNode
  pendingLabel?: string
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost"
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending} name={name} value={value}>
      {pending ? pendingLabel : children}
    </Button>
  )
}
