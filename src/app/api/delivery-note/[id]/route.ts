import { jobs } from "@/server/repositories"

export const dynamic = "force-dynamic"

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const job = await jobs.getJob(id)
  if (!job?.deliveryNote) {
    return new Response("No delivery note is stored for this job.", { status: 404 })
  }
  return new Response(job.deliveryNote.body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="delivery-note.txt"`,
    },
  })
}
