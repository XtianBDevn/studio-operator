import type { ServiceTemplate } from "@/lib/service-templates"
import { PLANNING_RATES } from "@/lib/planning-rates"

export type IntakeQuestion = {
  id: string
  topic: "quality" | "cost" | "rights" | "deadline"
  prompt: string
  asset: string | null
}

const VAGUE_GLASS = /glass monument|after the rain/i

export function materialQuestions(input: {
  vague: string
  suppliedLabels: string[]
  template: ServiceTemplate | null
}): IntakeQuestion[] {
  const labels = input.suppliedLabels.join("\n")
  const questions: IntakeQuestion[] = []
  const hasReference = /reference|silhouette|keyframe|product image|source ad/i.test(labels)
  const hasLikes = /like|dislike/i.test(`${input.vague}\n${labels}`)
  const hasCopy = /exact copy|on-screen|headline|spoken/i.test(input.vague)
  const mentionsPerson = /\b(likeness|voice of|sounds like|real person|zendaya|spokesperson)\b/i.test(input.vague)

  if (!hasReference && (VAGUE_GLASS.test(input.vague) || input.template?.id === "launch_video")) {
    questions.push({
      id: "material_reference",
      topic: "quality",
      asset: "Approved material or product reference",
      prompt: "Which still is the approved material or product the picture has to match?",
    })
  }
  if (input.template?.id === "ugc_ad_pack" && !hasCopy) {
    questions.push({
      id: "exact_copy",
      topic: "quality",
      asset: "Exact spoken and on-screen copy",
      prompt: "What is the exact spoken line and the exact on-screen line?",
    })
  }
  if (input.template?.id === "localization_pack" && !/language/i.test(input.vague)) {
    questions.push({
      id: "languages",
      topic: "deadline",
      asset: null,
      prompt: "Which five languages should the approved source ad be adapted into?",
    })
  }
  if (!hasLikes && input.template?.id === "ugc_ad_pack") {
    questions.push({
      id: "examples",
      topic: "quality",
      asset: "Examples the client likes and dislikes",
      prompt: "Which examples should we follow, and which should we avoid?",
    })
  }
  if (mentionsPerson) {
    questions.push({
      id: "consent",
      topic: "rights",
      asset: "Voice or likeness consent for this person and this use",
      prompt: "Who is the person, and which exact use does their consent cover? An older approval does not carry over.",
    })
  }
  if (!input.template && !/hour|day|deadline|tomorrow/i.test(input.vague)) {
    questions.push({
      id: "deadline",
      topic: "deadline",
      asset: null,
      prompt: "When does the approved master need to be ready?",
    })
  }
  return questions.slice(0, 3)
}

export function scopeSummary(input: { title: string; template: ServiceTemplate }): string {
  return [
    `${input.title} is a ${input.template.name}.`,
    input.template.summary,
    `Included revisions: ${input.template.includedRevisionRounds}.`,
    `Exclusions: ${input.template.exclusions.join(" ")}`,
  ].join(" ")
}

export function proposalDraft(input: { title: string; template: ServiceTemplate; priceCents: number }): string {
  const price = (input.priceCents / 100).toFixed(2)
  return [
    `Proposal for ${input.title}`,
    "",
    scopeSummary(input),
    "",
    "Deliverables:",
    ...input.template.deliverables.map((item) => `- ${item}`),
    "",
    `Timeline: ${input.template.timeline}`,
    `Price: ${price} USD as a fixed package.`,
    `Included revisions: ${input.template.includedRevisionRounds}.`,
    "Exclusions:",
    ...input.template.exclusions.map((item) => `- ${item}`),
    "",
    "This draft is for a person to approve. It was not sent through a marketplace, and it does not accept a contract.",
  ].join("\n")
}

export function progressUpdate(input: { title: string; milestone: string; next: string }): string {
  return [
    input.title,
    "",
    input.milestone,
    input.next,
    "",
    "This update is about the work in progress. It does not change the price, the deadline, or the approved scope.",
  ].join("\n")
}

export function conceptPresentation(input: { title: string; changed: string; decision: string }): string {
  return [`${input.title}`, "", `What changed: ${input.changed}`, `Decision needed: ${input.decision}`].join("\n")
}

export type RevisionRead = {
  affectedAsset: string
  affectedStep: string
  incrementalCents: number
  included: boolean
  scopeChange: boolean
  summary: string
  changeOrder: string | null
}

export function interpretRevision(input: {
  note: string
  steps: Array<{ name: string; capability: string }>
  includedRounds: number
  usedRounds: number
}): RevisionRead {
  const warmer = /warmer|hopeful|reveal/i.test(input.note)
  const bigger = /another film|new duration|extra language|add a|30-second|new product|reshoot the whole/i.test(input.note)
  const finish = input.steps.find((step) => step.capability === "finishing")
  const motion = input.steps.find((step) => /motion|orbit|final/i.test(step.name)) ?? input.steps.find((step) => step.capability === "video")
  const step = warmer ? finish ?? motion : motion
  const incrementalCents = warmer ? PLANNING_RATES.finishing.unitCostCents : PLANNING_RATES.video.unitCostCents
  const roundsLeft = input.usedRounds < input.includedRounds
  const included = warmer && roundsLeft && !bigger
  const scopeChange = !included
  const summary = included
    ? `This is included revision ${input.usedRounds + 1} of ${input.includedRounds}. It changes the grade of the final reveal. Estimated finishing cost is ${(incrementalCents / 100).toFixed(2)} USD.`
    : "This request goes beyond the agreed scope. It needs a change order and a person."
  return {
    affectedAsset: warmer ? "Final reveal" : "Agreed master",
    affectedStep: step?.name ?? "Finish",
    incrementalCents,
    included,
    scopeChange,
    summary,
    changeOrder: scopeChange
      ? [
          "Change order",
          "",
          input.note.trim(),
          "",
          `Affected step: ${step?.name ?? "a new step"}.`,
          `Estimated addition: ${(incrementalCents / 100).toFixed(2)} USD at the desk planning rate.`,
          "This draft does not accept new work and was not sent through a marketplace.",
        ].join("\n")
      : null,
  }
}

export function deliveryPackageDraft(input: { title: string; files: string[]; usage: string }): string {
  return [
    input.title,
    "",
    "Drafted by GPT-6 Astra.",
    "",
    "Files:",
    ...input.files.map((file) => `- ${file}`),
    "",
    `Usage: ${input.usage}`,
    "A person still has to approve final delivery. Nothing was uploaded to a marketplace.",
  ].join("\n")
}

export function followUpDraft(input: { title: string }): string {
  return [
    input.title,
    "",
    "When you have watched the files, reply with what you want to keep and what you want to change next time.",
    "If the film is useful, a short testimonial in your own words helps the studio.",
    "A recurring package can cover the next film on the same monument, material, and site. It would be a new order, not an extension of this one.",
    "",
    "This note was drafted for a person. It was not sent through a marketplace.",
  ].join("\n")
}
