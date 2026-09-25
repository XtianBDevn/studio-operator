import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import type { NormalizedAsset } from "@/server/services/higgsfield/protocol"

const MAX_BYTES = 200_000_000

const EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/mp4": ".m4a",
}

export function storageRoot(): string {
  return path.join(process.cwd(), "storage")
}

export function extensionFor(contentType: string, kind: NormalizedAsset["kind"]): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? ""
  const mapped = EXTENSIONS[normalized]
  if (mapped) return mapped
  if (kind === "video") return ".mp4"
  if (kind === "audio") return ".mp3"
  return ".png"
}

export function contentTypeForExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const match = Object.entries(EXTENSIONS).find(([, value]) => value === ext)
  return match?.[0] ?? "application/octet-stream"
}

export function assetPath(parts: {
  scope: "generations" | "connection"
  groupId: string
  fileId: string
  extension: string
}): string {
  assertKey(parts.groupId)
  assertKey(parts.fileId)
  if (!/^\.[a-z0-9]+$/.test(parts.extension)) {
    throw new Error("Refused an asset extension.")
  }
  return path.join(storageRoot(), parts.scope, parts.groupId, `${parts.fileId}${parts.extension}`)
}

export function assertInsideStorage(filePath: string): string {
  const root = path.resolve(storageRoot())
  const resolved = path.resolve(filePath)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refused an asset path outside app storage.")
  }
  return resolved
}

export async function storeCopiedAsset(input: {
  asset: NormalizedAsset
  scope: "generations" | "connection"
  groupId: string
  fileId: string
  publicPath: string
  fetchImpl?: typeof fetch
}): Promise<{ localPath: string; outputUrl: string; contentType: string }> {
  const downloaded = await downloadProviderAsset(input.asset, input.fetchImpl)
  const extension = extensionFor(downloaded.contentType, input.asset.kind)
  const localPath = assetPath({
    scope: input.scope,
    groupId: input.groupId,
    fileId: input.fileId,
    extension,
  })
  const destination = assertInsideStorage(localPath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, downloaded.bytes)
  return { localPath: destination, outputUrl: input.publicPath, contentType: downloaded.contentType }
}

async function downloadProviderAsset(asset: NormalizedAsset, fetchImpl: typeof fetch = fetch) {
  let url: URL
  try {
    url = new URL(asset.url)
  } catch {
    throw new Error("Provider asset URL could not be read. The file was not copied.")
  }
  if (url.protocol !== "https:") {
    throw new Error("Provider asset URL was not https. The file was not copied.")
  }
  const response = await fetchImpl(asset.url, { method: "GET" })
  if (!response.ok) throw new Error(`Asset copy failed (${response.status}).`)
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream"
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length === 0) throw new Error("Provider asset was empty. The file was not copied.")
  if (bytes.length > MAX_BYTES) throw new Error("Provider asset is too large to copy.")
  return { contentType, bytes }
}

function assertKey(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error("Refused an asset storage key.")
  }
}
