import assert from "node:assert/strict"

import { ANALYSIS_SYSTEM_PROMPT, OPERATOR_SYSTEM_PROMPT } from "../src/lib/analysis"
import {
  DEFAULT_AUTONOMY_SETTINGS,
  decideAutoSpend,
  decideDelivery,
  dispatchMessage,
} from "../src/lib/autonomy-policy"
import {
  interpretRevision,
  materialQuestions,
  proposalDraft,
} from "../src/lib/client-agent"
import { consentCoversAny } from "../src/lib/client-memory"
import { GLASS_MONUMENT } from "../src/lib/demos"
import { PRODUCT_GUARDRAILS, assertAllowedOperation } from "../src/lib/guardrails"
import { catalogById } from "../src/lib/router-catalog"
import { chooseRepair } from "../src/lib/self-repair"
import {
  LAUNCH_VIDEO,
  LOCALIZATION_PACK,
  SERVICE_TEMPLATES,
  UGC_AD_PACK,
  templateSpendCents,
} from "../src/lib/service-templates"

const harborConsent = {
  personLabel: "Harbor tour narrator",
  kind: "voice" as const,
  useScope: "2024 harbor tour recap",
}

assert.equal(OPERATOR_SYSTEM_PROMPT, ANALYSIS_SYSTEM_PROMPT)
assert.match(OPERATOR_SYSTEM_PROMPT, /operations lead for a small AI creative studio/)
assert.match(OPERATOR_SYSTEM_PROMPT, /Do not invent model capabilities, prices, endpoints, or availability/)
assert.match(OPERATOR_SYSTEM_PROMPT, /Recommend accept only when/)

for (const operation of PRODUCT_GUARDRAILS.forbidden) {
  assert.throws(() => assertAllowedOperation(operation), /guardrail/)
}
for (const operation of ["client.draft_message", "client.send_first_party", "autonomy.configure", "autonomy.audit"]) {
  assert.doesNotThrow(() => assertAllowedOperation(operation))
}

const marketplace = dispatchMessage({
  kind: "progress_update",
  channel: "marketplace",
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: [],
})
assert.equal(marketplace.disposition, "blocked")

const portalUpdate = dispatchMessage({
  kind: "progress_update",
  channel: "portal",
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: [],
})
assert.equal(portalUpdate.disposition, "sent")
assert.match(portalUpdate.reason, /first-party portal/)

const proposal = dispatchMessage({
  kind: "proposal",
  channel: "portal",
  settings: { ...DEFAULT_AUTONOMY_SETTINGS, autoSend: ["proposal"] },
  pauses: [],
})
assert.equal(proposal.disposition, "draft")

const paused = dispatchMessage({
  kind: "progress_update",
  channel: "email",
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: ["likeness_or_voice"],
})
assert.equal(paused.disposition, "draft")

assert.equal(decideDelivery(DEFAULT_AUTONOMY_SETTINGS).disposition, "blocked")
assert.equal(
  decideDelivery({ ...DEFAULT_AUTONOMY_SETTINGS, finalDeliveryRequiresApproval: false }).disposition,
  "sent",
)

const inside = decideAutoSpend({
  settings: DEFAULT_AUTONOMY_SETTINGS,
  spentCents: 21_100,
  incrementalCents: 4_500,
  pauses: [],
})
assert.equal(inside.allowed, true)

const repairCap = decideAutoSpend({
  settings: DEFAULT_AUTONOMY_SETTINGS,
  spentCents: 0,
  incrementalCents: 9_000,
  pauses: [],
})
assert.equal(repairCap.allowed, false)
assert.match(repairCap.reason, /per-repair/)

const jobCap = decideAutoSpend({
  settings: DEFAULT_AUTONOMY_SETTINGS,
  spentCents: 28_000,
  incrementalCents: 4_500,
  pauses: [],
})
assert.equal(jobCap.allowed, false)
assert.match(jobCap.reason, /automatic spend for this job/)

const glassQuestions = materialQuestions({
  vague: "A short cinematic film of our glass monument after the rain.",
  suppliedLabels: [],
  template: LAUNCH_VIDEO,
})
assert.equal(glassQuestions.length, 1)
assert.equal(glassQuestions[0]?.prompt, "Which still is the approved material or product the picture has to match?")

const answered = materialQuestions({
  vague: "A short cinematic film of our glass monument after the rain.",
  suppliedLabels: ["Glass-material references"],
  template: LAUNCH_VIDEO,
})
assert.equal(answered.length, 0)

const warmer = interpretRevision({
  note: "Please make the final reveal warmer and more hopeful.",
  steps: [{ name: "Finish", capability: "finishing" }],
  includedRounds: 2,
  usedRounds: 0,
})
assert.equal(warmer.included, true)
assert.equal(warmer.scopeChange, false)
assert.equal(warmer.changeOrder, null)
assert.equal(warmer.affectedAsset, "Final reveal")
assert.equal(warmer.incrementalCents, 2000)

const bigger = interpretRevision({
  note: "Please add a 30-second cut of a new product.",
  steps: [{ name: "Final motion", capability: "video" }],
  includedRounds: 2,
  usedRounds: 0,
})
assert.equal(bigger.included, false)
assert.equal(bigger.scopeChange, true)
assert.match(bigger.changeOrder ?? "", /does not accept new work/)
assert.match(bigger.changeOrder ?? "", /marketplace/)

const draft = proposalDraft({
  title: GLASS_MONUMENT.title,
  template: LAUNCH_VIDEO,
  priceCents: GLASS_MONUMENT.budgetCents,
})
assert.match(draft, /4800\.00 USD/)
assert.match(draft, /does not accept a contract/)
assert.match(draft, /was not sent through a marketplace/)

assert.equal(consentCoversAny([harborConsent], harborConsent), true)
assert.equal(
  consentCoversAny([harborConsent], {
    personLabel: "A new narrator",
    kind: "voice",
    useScope: "2024 harbor tour recap",
  }),
  false,
)
assert.equal(
  consentCoversAny([harborConsent], {
    personLabel: "Harbor tour narrator",
    kind: "voice",
    useScope: "monument film",
  }),
  false,
)
assert.equal(
  consentCoversAny([harborConsent], {
    personLabel: "Harbor tour narrator",
    kind: "likeness",
    useScope: "2024 harbor tour recap",
  }),
  false,
)

const repair = chooseRepair({
  checks: [{ id: "motion", status: "fail" }],
  repairModelId: "bytedance/seedance-2.5/video-edit",
  repairModelLabel: "Seedance 2.5 video edit",
  repairRole: "CONTROL",
  incrementalCents: 4_500,
  spentCents: 21_100,
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: [],
  missingQuestion: false,
})
assert.equal(repair.action, "targeted_edit")
assert.equal(repair.allowed, true)
assert.equal(repair.component, "reflection and geometry continuity")

const overCap = chooseRepair({
  checks: [{ id: "motion", status: "fail" }],
  repairModelId: "higgsfield/cinema-studio/4.0",
  repairModelLabel: "Cinema Studio 4.0",
  repairRole: "SHIP",
  incrementalCents: 9_000,
  spentCents: 0,
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: [],
  missingQuestion: false,
})
assert.equal(overCap.allowed, false)
assert.match(overCap.reason, /per-repair/)

const rights = chooseRepair({
  checks: [{ id: "motion", status: "fail" }],
  repairModelId: "bytedance/seedance-2.5/video-edit",
  repairModelLabel: "Seedance 2.5 video edit",
  repairRole: "CONTROL",
  incrementalCents: 4_500,
  spentCents: 0,
  settings: DEFAULT_AUTONOMY_SETTINGS,
  pauses: ["likeness_or_voice"],
  missingQuestion: false,
})
assert.equal(rights.action, "escalate")
assert.equal(rights.allowed, false)

const blockedFamily = chooseRepair({
  checks: [{ id: "motion", status: "fail" }],
  repairModelId: "bytedance/seedance-2.5/video-edit",
  repairModelLabel: "Seedance 2.5 video edit",
  repairRole: "CONTROL",
  incrementalCents: 4_500,
  spentCents: 0,
  settings: { ...DEFAULT_AUTONOMY_SETTINGS, allowedFamilies: ["SEARCH"] },
  pauses: [],
  missingQuestion: false,
})
assert.equal(blockedFamily.action, "change_model")
assert.equal(blockedFamily.allowed, false)

assert.equal(SERVICE_TEMPLATES.length, 3)
assert.match(LAUNCH_VIDEO.summary, /15-second/)
assert.match(LAUNCH_VIDEO.summary, /72-hour/)
assert.equal(LAUNCH_VIDEO.includedRevisionRounds, 2)
assert.match(UGC_AD_PACK.summary, /Three hooks/)
assert.equal(UGC_AD_PACK.includedRevisionRounds, 1)
assert.match(LOCALIZATION_PACK.summary, /five languages/)
assert.match(LOCALIZATION_PACK.escalation.join(" "), /Lip sync/)
assert.match(LOCALIZATION_PACK.recipe.map((step) => step.note).join(" "), /not on the indexes|not in the catalog/)

for (const template of SERVICE_TEMPLATES) {
  assert.ok(template.requiredInputs.length > 0)
  assert.ok(template.acceptedFileTypes.includes("png"))
  assert.ok(template.qualityChecklist.length > 0)
  assert.ok(template.deliveryPackage.length > 0)
  assert.equal(template.targetMarginBps, 2500)
  assert.equal(templateSpendCents(template), template.maxProductionSpendCents)
  assert.ok(template.escalation.length >= 7)
  for (const step of template.recipe) {
    const entry = catalogById(step.modelId)
    assert.ok(entry, `${template.id} uses an unknown model ${step.modelId}`)
    assert.equal(step.role, entry.role)
  }
}

console.log("autonomy tests passed")
