export type UpdateAllItemType = 'plugin' | 'homebridge' | 'ui'

export type UpdateAllExclusionReason = 'hidden' | 'disabled' | 'major' | 'engines'

/** The widest thing updating an item restarts - computed server-side; the client only folds these */
export type UpdateAllRestartImpact = 'ui' | 'homebridge' | 'child-bridges'

export interface UpdateAllPlanItem {
  type: UpdateAllItemType
  name: string
  displayName?: string
  /** The plugin's icon URL from the plugin list, or null - fall back to the Homebridge icon */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on. Empty means it runs on the main bridge, so updating it restarts Homebridge */
  childBridgeUsernames?: string[]
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
  /** The plugin's icon URL, so the progress rows match the confirm rows */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on, followed back after the run */
  childBridgeUsernames?: string[]
  restartImpact?: UpdateAllRestartImpact
  from: string
  to: string
  status: UpdateAllItemStatus
  reason?: string
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
    childBridges?: 'done' | 'failed' | 'not-needed'
  }
}

/** What the `subscribe` message on the `update-all` ws namespace returns */
export interface UpdateAllSnapshot {
  active: boolean
  journal: UpdateAllJournal | null
}
