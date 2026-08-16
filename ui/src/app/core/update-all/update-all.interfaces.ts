import { InjectionToken } from '@angular/core'

export type UpdateAllItemType = 'plugin' | 'homebridge' | 'ui'

export type UpdateAllExclusionReason = 'hidden' | 'disabled' | 'major' | 'engines'

export interface UpdateAllPlanItem {
  type: UpdateAllItemType
  name: string
  displayName?: string
  /** The plugin's icon URL from the plugin list, or null - fall back to the Homebridge icon */
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
  /** The plugin's icon URL, so the progress rows match the confirm rows */
  icon?: string | null
  /** Plugins only: the child bridges the plugin runs on, followed back after the run */
  childBridgeUsernames?: string[]
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
  acknowledged: boolean
  items: UpdateAllJournalItem[]
  restart: {
    homebridge: 'done' | 'failed' | 'not-needed' | 'pending'
    ui: 'scheduled' | 'not-needed' | 'pending'
    childBridges?: 'done' | 'failed' | 'not-needed'
  }
}

/**
 * Opens the modal straight into an existing run rather than the plan phase.
 * Provided through the modal's injector so it is set before the component is
 * constructed - assigning `componentInstance` after `open()` would be too late,
 * because `ngOnInit` has already run by then.
 */
export const UPDATE_ALL_MODAL_DATA = new InjectionToken<{ resume: boolean }>('UPDATE_ALL_MODAL_DATA')

/** What the `subscribe` message on the `update-all` ws namespace returns */
export interface UpdateAllSnapshot {
  active: boolean
  journal: UpdateAllJournal | null
}
