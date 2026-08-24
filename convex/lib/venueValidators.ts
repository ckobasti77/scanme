import { v } from "convex/values";

// Smallest validators that let the `venueEventConfigs` table (RFC-001 §2.4 C.2)
// compile in this schema-shape task. The real Venue block union (countdown,
// gallery, programTimeline, menu, reservation, …) and the page-level design
// token validator are built by the design engine in TASK-06 (RFC-001 §2.5);
// no block types are invented here.
//
// TODO(TASK-06): replace `venueDesignValidator` with the page-level token
// validator (`--venue-*` design) and `venueBlockValidator` with the discriminated
// block union defined against the generic design engine. These placeholders only
// have to satisfy the schema for an empty table.
export const venueDesignValidator = v.object({});

export const venueBlockValidator = v.object({
  id: v.string(),
  type: v.string(),
});
