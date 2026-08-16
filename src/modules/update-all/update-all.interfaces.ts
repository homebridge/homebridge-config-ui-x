export type UpdateAllItemType = 'plugin' | 'homebridge' | 'ui'

export type UpdateAllExclusionReason = 'hidden' | 'disabled' | 'major' | 'engines'

export interface UpdateAllPlanItem {
  type: UpdateAllItemType
  name: string
  displayName?: string
  /** The plugin's icon URL from the plugin list, or null - the UI falls back to the Homebridge icon */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on. Empty means it runs on the main bridge, so updating it restarts Homebridge */
  childBridgeUsernames?: string[]
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
  /** Set once the user has seen the post-run summary, so it shows only once */
  acknowledged: boolean
  items: UpdateAllJournalItem[]
  restart: {
    homebridge: 'done' | 'failed' | 'not-needed' | 'pending'
    ui: 'scheduled' | 'not-needed' | 'pending'
    /** Set when only child bridges needed restarting - a full Homebridge restart covers them, so the two are mutually exclusive */
    childBridges?: 'done' | 'failed' | 'not-needed'
  }
}
