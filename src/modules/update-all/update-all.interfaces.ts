export type UpdateAllItemType = 'plugin' | 'homebridge' | 'ui'

export type UpdateAllExclusionReason = 'hidden' | 'disabled' | 'major' | 'engines'

/**
 * The widest thing updating this item restarts, computed server-side (one
 * owner: the same semantics the finale executes - a main-bridge plugin means
 * a Homebridge restart). The client folds these with plain containment
 * (ui ⊃ homebridge ⊃ child bridges) and never re-derives the semantics.
 */
export type UpdateAllRestartImpact = 'ui' | 'homebridge' | 'child-bridges'

export interface UpdateAllPlanItem {
  type: UpdateAllItemType
  name: string
  displayName?: string
  /** The plugin's icon URL from the plugin list, or null - the UI falls back to the Homebridge icon */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on. Empty means it runs on the main bridge, so updating it restarts Homebridge */
  childBridgeUsernames?: string[]
  /** Set on includable items only - exclusions never restart anything */
  restartImpact?: UpdateAllRestartImpact
  from: string
  to: string
}

export interface UpdateAllPlanExclusion extends UpdateAllPlanItem {
  reason: UpdateAllExclusionReason
}

export interface UpdateAllPlan {
  /** What a run would update, in run order: Homebridge, then the UI, then plugins A→Z */
  items: UpdateAllPlanItem[]
  /** Major version jumps - never run from Update All, updated individually instead */
  needsReview: UpdateAllPlanExclusion[]
  /** Excluded outright: update hidden by the user, plugin disabled, or engines-incompatible */
  skipped: UpdateAllPlanExclusion[]
}

export type UpdateAllItemStatus = 'planned' | 'running' | 'ok' | 'failed' | 'skipped'

export interface UpdateAllJournalItem {
  type: UpdateAllItemType
  name: string
  displayName?: string
  /** The plugin's icon URL, carried so the progress modal can show the same rows the confirm modal did */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on, so the progress modal can follow each one's restart */
  childBridgeUsernames?: string[]
  /** Copied from the plan item; absent on journals written before it existed */
  restartImpact?: UpdateAllRestartImpact
  from: string
  to: string
  status: UpdateAllItemStatus
  /** Why an item was skipped or failed, for the summary and support logs */
  reason?: string
  /** The last lines of the item's update output, capped at write time */
  logTail?: string[]
}

export interface UpdateAllJournal {
  schemaVersion: 1
  runId: string
  startedAt: string
  finishedAt?: string
  items: UpdateAllJournalItem[]
  restart: {
    homebridge: 'done' | 'failed' | 'not-needed' | 'pending'
    ui: 'scheduled' | 'not-needed' | 'pending'
    /** Set when only child bridges needed restarting - a full Homebridge restart covers them, so the two are mutually exclusive */
    childBridges?: 'done' | 'failed' | 'not-needed'
  }
}
