import { readFile } from "node:fs/promises"

import { connectionTests } from "@/server/repositories"
import { assertInsideStorage, contentTypeForExtension } from "@/server/services/higgsfield/assets"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const stored = await connectionTests.localPath(id)
  if (!stored) return new Response("Not found", { status: 404 })
  try {
    const filePath = assertInsideStorage(stored)
    const bytes = await readFile(filePath)
    return new Response(bytes, {
      headers: {
        "Content-Type": contentTypeForExtension(filePath),
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch {
    return new Response("Not found", { status: 404 })
  }
}
