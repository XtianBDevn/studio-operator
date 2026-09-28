/**
 * Catalog truth table. Three layers, three jobs. Do not collapse them.
 *
 * 1. Planning capability rates — desk economics for image, video, voice, editing,
 *    and finishing. Labeled as planning rates, not provider list prices.
 *    Models must not invent prices. See `PLANNING_RATES`.
 * 2. Routable model ids — models the transparent router may propose, with
 *    documented substitutes where Seedream, Flux, Veo, Speak, Topaz, lip sync,
 *    or captions are missing. See `ROUTER_CATALOG`.
 * 3. Live-submittable workflows — only SOUL V2 still and Kling 3.0 Standard
 *    text-to-video. In `STUDIO_OPERATOR_MODE=live`, a route step outside this
 *    layer fails before any network call. See `LIVE_SUBMITTABLE_WORKFLOWS`.
 */

export {
  PLANNING_RATES,
  PLANNING_RATE_NOTE,
  planningCapabilityPrices,
} from "@/lib/planning-rates"

export {
  ROUTER_CATALOG,
  ROUTE_ROLES,
  ROUTE_STAGES,
  STAGE_LABELS,
  PATTERN_LABEL,
  catalogById,
  catalogByRole,
  requireCatalog,
  defaultStage,
  unitCostCents,
  type CatalogEntry,
  type RouteRole,
  type RouteStage,
} from "@/lib/router-catalog"

export {
  CATALOG_OPERATOR_NOTE,
  LIVE_SUBMITTABLE_WORKFLOWS,
  assertLiveSubmittable,
  isLiveSubmittable,
  liveNonSubmittableMessage,
  liveWorkflowForModel,
  modelLayerLabel,
  wiredLiveEndpoint,
  type LiveWorkflowId,
} from "@/lib/live-workflows"
