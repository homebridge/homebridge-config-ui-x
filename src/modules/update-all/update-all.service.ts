import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import process from 'node:process'

import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common'
import { lt, major, minVersion } from 'semver'

import { ConfigService } from '../../core/config/config.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { BackupService } from '../backup/backup.service.js'
import { ChildBridgesService } from '../child-bridges/child-bridges.service.js'
import { HomebridgePlugin } from '../plugins/plugins.interfaces.js'
import { PluginsService } from '../plugins/plugins.service.js'
import { UpdateAllJournalService } from './update-all-journal.service.js'
import { UpdateAllExclusionReason, UpdateAllJournal, UpdateAllPlan, UpdateAllPlanItem, UpdateAllRestartImpact } from './update-all.interfaces.js'

/** What the completed items of a run call for - the finale acts on this */
interface RestartNeeds {
  homebridge: boolean
  ui: boolean
  childBridgeUsernames: Set<string>
}

@Injectable()
export class UpdateAllService {
  /**
   * The singleton run slot. Set synchronously in reserveRunSlot() before the
   * first await on the start path, so two concurrent starts cannot both pass
   * the gate - the same pattern as the backup restore slot.
   */
  private runInProgress = false
  private cancelRequested = false
  private runningPromise: Promise<void> | null = null

  /**
   * Progress events for the gateway to forward: `item-start {name}`,
   * `stdout {name, data}`, `item-result {name, status}`,
   * `run-complete {runId}`. Each fires AFTER the matching journal write, so
   * a snapshot read on connect can never be ahead of the event stream.
   */
  public readonly events = new EventEmitter()

  constructor(
    @Inject(BackupService) private readonly backupService: BackupService,
    @Inject(ChildBridgesService) private readonly childBridgesService: ChildBridgesService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(UpdateAllJournalService) private readonly journalService: UpdateAllJournalService,
  ) {}

  /**
   * Compute what an Update All run would do right now. A pure read: nothing
   * is installed, restarted or written. Every exclusion carries the first
   * matching reason (hidden → disabled → major → engines) so the confirm
   * modal can say why.
   */
  public async computePlan(): Promise<UpdateAllPlan> {
    const plan: UpdateAllPlan = { items: [], needsReview: [], skipped: [] }

    // If Homebridge or the UI cannot be resolved the instance has bigger
    // problems, but the rest of the plan is still worth returning. The three
    // lookups are independent reads, so they run together - on a cache-cold
    // Pi each one is registry work, and the plan is computed twice per run
    // (once for the modal, once to revalidate the confirmed list).
    const [homebridgePkg, uiPkg, allOutOfDatePlugins] = await Promise.all([
      this.getPackageSafely(() => this.pluginsService.getHomebridgePackage(), 'Homebridge'),
      this.getPackageSafely(() => this.pluginsService.getHomebridgeUiPackage(), 'Homebridge UI'),
      this.pluginsService.getOutOfDatePlugins(),
    ])
    const homebridgeVersion = homebridgePkg?.installedVersion || null

    // Homebridge and the UI already have their own update policies applied by
    // their getters - a policy of 'none' simply reports no update available.
    if (homebridgePkg?.updateAvailable) {
      this.placeItem(plan, {
        type: 'homebridge',
        name: 'homebridge',
        displayName: 'Homebridge',
        icon: null,
        restartImpact: 'homebridge',
        from: homebridgePkg.installedVersion,
        to: homebridgePkg.latestVersion,
      }, this.exclusionReason({
        hidden: false,
        disabled: false,
        from: homebridgePkg.installedVersion,
        to: homebridgePkg.latestVersion,
        engines: homebridgePkg.updateEngines,
        homebridgeVersion: null,
      }))
    }

    if (uiPkg?.updateAvailable) {
      this.placeItem(plan, {
        type: 'ui',
        name: this.configService.name,
        displayName: uiPkg.displayName || 'Homebridge UI',
        icon: uiPkg.icon || null,
        restartImpact: 'ui',
        from: uiPkg.installedVersion,
        to: uiPkg.latestVersion,
      }, this.exclusionReason({
        hidden: false,
        disabled: false,
        from: uiPkg.installedVersion,
        to: uiPkg.latestVersion,
        engines: uiPkg.updateEngines,
        // The UI's engines.homebridge is real (a new UI can require a newer
        // Homebridge) and the single-update flow checks it - so must the plan
        homebridgeVersion,
      }))
    }

    // getOutOfDatePlugins() already honours each plugin's beta channel. The UI
    // carries the homebridge-plugin keyword so it appears in the plugin list
    // too - it is filtered out here, having been planned as its own 'ui' item.
    const outOfDatePlugins = allOutOfDatePlugins
      .filter(x => x.name !== this.configService.name)
      .sort((a, b) => a.name.localeCompare(b.name))

    const hideUpdatesFor = this.configService.ui.plugins?.hideUpdatesFor || []

    // The child-bridge lookups are pure reads, so they run together too;
    // items are then placed in the sorted order the run will use
    const resolved = await Promise.all(outOfDatePlugins.map(async (plugin) => {
      const reason = this.exclusionReason({
        hidden: hideUpdatesFor.includes(plugin.name),
        disabled: plugin.disabled === true,
        from: plugin.installedVersion,
        to: plugin.latestVersion,
        engines: plugin.updateEngines,
        homebridgeVersion,
      })
      // The same resolution performPackageUpdate uses after installing, so
      // the modal's restart prediction always matches what the finale does.
      // Only included items can be selected - exclusions skip the lookup.
      const childBridgeUsernames = reason === null ? await this.pluginsService.getPluginChildBridgeUsernames(plugin.name) : []
      return { plugin, reason, childBridgeUsernames }
    }))

    for (const { plugin, reason, childBridgeUsernames } of resolved) {
      this.placeItem(plan, {
        type: 'plugin',
        name: plugin.name,
        displayName: plugin.displayName,
        icon: plugin.icon || null,
        from: plugin.installedVersion,
        to: plugin.latestVersion,
        childBridgeUsernames,
        // A main-bridge plugin (no child bridges) restarts Homebridge - the
        // one place that semantic lives; the client only folds impacts
        ...(reason === null ? { restartImpact: (childBridgeUsernames.length ? 'child-bridges' : 'homebridge') as UpdateAllRestartImpact } : {}),
      }, reason)
    }

    return plan
  }

  private placeItem(plan: UpdateAllPlan, item: UpdateAllPlanItem, reason: UpdateAllExclusionReason | null): void {
    if (reason === null) {
      plan.items.push(item)
    } else if (reason === 'major') {
      plan.needsReview.push({ ...item, reason })
    } else {
      plan.skipped.push({ ...item, reason })
    }
  }

  private exclusionReason(opts: {
    hidden: boolean
    disabled: boolean
    from: string
    to: string
    engines: HomebridgePlugin['updateEngines']
    homebridgeVersion: string | null
  }): UpdateAllExclusionReason | null {
    if (opts.hidden) {
      return 'hidden'
    }
    if (opts.disabled) {
      return 'disabled'
    }
    try {
      if (major(opts.to) > major(opts.from)) {
        return 'major'
      }
    } catch (e) {
      this.logger.debug(`Update All plan: could not compare versions ${opts.from} → ${opts.to} (${e.message}).`)
    }
    if (this.failsEngines(opts.engines, opts.homebridgeVersion)) {
      return 'engines'
    }
    return null
  }

  /**
   * The same compatibility check the frontend runs before a single update
   * (manage-plugins.service checkHbAndNodeVersion), applied server-side.
   * An unparseable engines field never blocks - npm ignores those too.
   */
  private failsEngines(engines: HomebridgePlugin['updateEngines'], homebridgeVersion: string | null): boolean {
    try {
      if (engines?.node) {
        const min = minVersion(engines.node)
        if (min && lt(process.version, min)) {
          return true
        }
      }
      if (engines?.homebridge && homebridgeVersion) {
        const min = minVersion(engines.homebridge)
        if (min && lt(homebridgeVersion, min)) {
          return true
        }
      }
    } catch (e) {
      this.logger.debug(`Update All plan: could not parse engines ${JSON.stringify(engines)} (${e.message}).`)
    }
    return false
  }

  private async getPackageSafely(getter: () => Promise<HomebridgePlugin>, label: string): Promise<HomebridgePlugin | null> {
    try {
      return await getter()
    } catch (e) {
      this.logger.warn(`Update All plan: could not resolve the ${label} package (${e.message}) - leaving it out of the plan.`)
      return null
    }
  }

  /**
   * Start an Update All run for the confirmed items. Reserves the singleton
   * slot, re-validates the confirmed list against a freshly computed plan,
   * writes the journal, and returns the run id while the serial update loop
   * continues in the background.
   */
  public async start(confirmed: { name: string, to: string }[]): Promise<{ runId: string }> {
    this.reserveRunSlot()
    try {
      const plan = await this.computePlan()
      const items = this.matchConfirmedToPlan(confirmed, plan)
      const runId = await this.journalService.startRun(items.map(x => ({ type: x.type, name: x.name, displayName: x.displayName, icon: x.icon, childBridgeUsernames: x.childBridgeUsernames, restartImpact: x.restartImpact, from: x.from, to: x.to })))
      this.logger.log(`Update All run ${runId} started: ${items.map(x => `${x.name}@${x.to}`).join(', ')}.`)
      this.runningPromise = this.executeRun(runId, items)
      return { runId }
    } catch (e) {
      this.runInProgress = false
      throw e
    }
  }

  /**
   * Ask the active run to stop. Takes effect between items - the item npm is
   * currently updating always finishes, so nothing is left half-installed.
   */
  public cancel(): { ok: true } {
    if (!this.runInProgress) {
      throw new BadRequestException('No Update All run is in progress.')
    }
    this.cancelRequested = true
    this.logger.warn('Update All run cancelled - stopping after the item currently updating.')
    return { ok: true }
  }

  /**
   * Resolve once the in-flight run (if any) has fully finished, journal
   * included.
   */
  public async waitForActiveRun(): Promise<void> {
    await this.runningPromise
  }

  /** Whether a run currently holds the singleton slot - part of the gateway's snapshot */
  public get isRunning(): boolean {
    return this.runInProgress
  }

  private reserveRunSlot(): void {
    if (this.runInProgress) {
      throw new ConflictException('An Update All run is already in progress.')
    }
    // A single-item UI update (the legacy endpoint) may have armed the 5s
    // self-restart fuse. exitOnceUpdatesFinish only waits while an npm
    // operation is IN FLIGHT, and this run has gaps between items (journal
    // writes), so starting now would let the exit truncate the run mid-way
    if (this.pluginsService.uiRestartPending) {
      throw new ConflictException('The Homebridge UI is about to restart after an update - try again once it is back.')
    }
    this.runInProgress = true
    this.cancelRequested = false
  }

  /**
   * The confirmed list is only trusted after it round-trips a fresh plan:
   * every entry must still be planned, at the same target version. The run
   * items come from the plan (its order and versions are authoritative),
   * never from the client payload.
   */
  private matchConfirmedToPlan(confirmed: { name: string, to: string }[], plan: UpdateAllPlan): UpdateAllPlanItem[] {
    const planByName = new Map(plan.items.map(x => [x.name, x]))
    const confirmedNames = new Set<string>()

    for (const item of confirmed) {
      if (typeof item?.name !== 'string' || typeof item?.to !== 'string') {
        throw new BadRequestException('Malformed entry in the confirmed item list.')
      }
      if (confirmedNames.has(item.name)) {
        throw new BadRequestException(`${item.name} appears more than once in the confirmed item list.`)
      }
      confirmedNames.add(item.name)

      const planned = planByName.get(item.name)
      if (!planned) {
        throw new BadRequestException(`${item.name} is not in the current update plan - refresh the plan and try again.`)
      }
      if (planned.to !== item.to) {
        throw new BadRequestException(`The target version of ${item.name} has changed (${item.to} → ${planned.to}) - refresh the plan and try again.`)
      }
    }

    return plan.items.filter(x => confirmedNames.has(x.name))
  }

  private async executeRun(runId: string, items: UpdateAllPlanItem[]): Promise<void> {
    let uiRestartNeeded = false
    let finalRestartState: UpdateAllJournal['restart'] | null = null
    // Which items reached a terminal state - if the loop machinery itself
    // dies, the crash handler below settles the rest so the journal never
    // strands items as running/planned forever
    const settled = new Set<string>()
    try {
      // Free insurance before touching anything. It handles its own failures
      // with a warning - an unavailable backup path should not block updates
      // the user has already confirmed.
      await this.backupService.runScheduledBackupJob()

      const needs: RestartNeeds = { homebridge: false, ui: false, childBridgeUsernames: new Set() }
      let homebridgeFailed = false

      for (const item of items) {
        if (this.cancelRequested) {
          await this.journalService.updateItem(item.name, 'skipped', { reason: 'Run cancelled by the user.' })
          this.emitEvent('item-result', { name: item.name, status: 'skipped' })
          settled.add(item.name)
          continue
        }
        // The UI's own update ends the process that also hosts Homebridge, so
        // going ahead after Homebridge has failed to update would restart a
        // half-updated Homebridge - and take away the interface needed to fix
        // it. Leave the UI where it is and say so.
        if (item.type === 'ui' && homebridgeFailed) {
          await this.journalService.updateItem(item.name, 'skipped', { reason: 'Skipped because the Homebridge update failed.' })
          this.emitEvent('item-result', { name: item.name, status: 'skipped' })
          settled.add(item.name)
          continue
        }

        await this.journalService.updateItem(item.name, 'running')
        this.emitEvent('item-start', { name: item.name })
        const { client, getLogTail } = this.makeOutputCollector(item.name)

        try {
          const result = await this.pluginsService.performPackageUpdate(item.name, item.to, client)
          if (result.ok) {
            await this.journalService.updateItem(item.name, 'ok', { logTail: getLogTail() })
            this.emitEvent('item-result', { name: item.name, status: 'ok' })
            needs.homebridge = needs.homebridge || result.restart.homebridge
            needs.ui = needs.ui || result.restart.ui
            result.restart.childBridgeUsernames.forEach(x => needs.childBridgeUsernames.add(x))
          } else {
            await this.journalService.updateItem(item.name, 'failed', { reason: result.error, logTail: getLogTail() })
            this.emitEvent('item-result', { name: item.name, status: 'failed' })
            homebridgeFailed = homebridgeFailed || item.type === 'homebridge'
          }
        } catch (e) {
          // performPackageUpdate reports expected failures in its result -
          // this is the unexpected kind. Record it and carry on: one broken
          // item must not strand the rest of the confirmed list.
          await this.journalService.updateItem(item.name, 'failed', { reason: e.message, logTail: getLogTail() })
          this.emitEvent('item-result', { name: item.name, status: 'failed' })
          homebridgeFailed = homebridgeFailed || item.type === 'homebridge'
        }
        settled.add(item.name)
      }

      finalRestartState = await this.finale(needs)
      uiRestartNeeded = needs.ui
    } catch (e) {
      // The loop machinery itself died - not an item (those are handled in
      // the loop). Settle the journal so the run reads as over: unreached
      // items are skipped with the reason, restarts recorded as pending
      // because what the half-run calls for is unknown. Nothing here throws.
      this.logger.error(`Update All run failed unexpectedly: ${e.message}.`)
      for (const item of items) {
        if (!settled.has(item.name)) {
          await this.journalService.updateItem(item.name, 'skipped', { reason: 'The run stopped unexpectedly before this item.' })
          this.emitEvent('item-result', { name: item.name, status: 'skipped' })
        }
      }
      await this.journalService.finishRun({ homebridge: 'pending', ui: 'pending' })
    } finally {
      this.runInProgress = false
      this.cancelRequested = false
    }

    // The slot is already released, so a failed or slow finale step below can
    // never wedge future runs. The journal is on disk (the finale wrote it) -
    // only now is it safe to arm the timer that ends this process.
    if (uiRestartNeeded) {
      try {
        this.logger.warn('Update All: the Homebridge UI updated itself, the server will now restart...')
        this.pluginsService.scheduleUiRestart()
      } catch (e) {
        this.logger.error(`Update All: failed to schedule the UI restart (${e.message}).`)
        try {
          await this.journalService.finishRun({ ...finalRestartState, ui: 'pending' })
        } catch {}
      }
    }

    this.emitEvent('run-complete', { runId })
  }

  /**
   * Progress listeners live outside the run - one throwing must never kill
   * the update loop, so every emit is fenced.
   */
  private emitEvent(event: string, payload: Record<string, any>): void {
    try {
      this.events.emit(event, payload)
    } catch (e) {
      this.logger.debug(`Update All: a progress listener threw on ${event} (${e.message}).`)
    }
  }

  /**
   * The smallest restart that covers everything the run changed.
   *
   * ⚠️ The three scopes contain each other, widest first:
   *
   * - The UI updated → it restarts itself, which ends the process hosting it.
   *   hb-service runs the UI in-process (`runUi`) and owns Homebridge as its
   *   child, so the whole service goes down and comes back: Homebridge
   *   returns, and with it every child bridge. Issuing either of the smaller
   *   restarts as well would only restart Homebridge twice, and would tear
   *   down child bridges seconds before the service takes them anyway.
   * - Otherwise Homebridge itself updated, or any updated plugin not in a
   *   child bridge → one full Homebridge restart, which also restarts every
   *   child bridge, so no separate bridge restarts on top.
   * - Otherwise only child-bridge plugins updated → restart just those.
   *
   * The first case holds for every install: standalone mode, where the UI ran
   * as its own service beside Homebridge, was removed in v5.0.0, and hb-service
   * is now the only thing that starts the UI.
   *
   * The journal's final state is written HERE, before the caller arms the
   * UI's own restart - that timer ends the process, and the journal is what
   * the freshly restarted UI reads back.
   */
  private async finale(needs: RestartNeeds): Promise<UpdateAllJournal['restart']> {
    const restart: UpdateAllJournal['restart'] = {
      homebridge: 'not-needed',
      ui: needs.ui ? 'scheduled' : 'not-needed',
      childBridges: 'not-needed',
    }

    if (needs.ui) {
      // Nothing to issue - the UI's own restart is the widest of the three and
      // brings Homebridge and every child bridge back with it.
      this.logger.log('Update All: the Homebridge UI restart will bring Homebridge and its child bridges back too.')
    } else if (needs.homebridge) {
      // restartHomebridge() reports rather than throws - false means no
      // restart was issued at all (no attached process), which must reach the
      // journal as 'failed' or the summary claims a restart that never
      // happened. The catch stays as the backstop for anything unexpected:
      // recorded, not rethrown - the journal write below must still happen
      try {
        this.logger.log('Update All: restarting Homebridge...')
        if (this.homebridgeIpcService.restartHomebridge()) {
          restart.homebridge = 'done'
        } else {
          this.logger.error('Update All: failed to restart Homebridge (no process attached).')
          restart.homebridge = 'failed'
        }
      } catch (e) {
        this.logger.error(`Update All: failed to restart Homebridge (${e.message}).`)
        restart.homebridge = 'failed'
      }
    } else if (needs.childBridgeUsernames.size > 0) {
      // Per-bridge try: one bridge failing to restart (e.g. the IPC channel
      // dropping mid-loop) must not abandon the rest, and bridges that DID
      // restart must not be reported as failed with them
      let anyFailed = false
      for (const username of needs.childBridgeUsernames) {
        try {
          this.logger.log(`Update All: restarting child bridge ${username}...`)
          this.childBridgesService.restartChildBridge(username)
        } catch (e) {
          anyFailed = true
          this.logger.error(`Update All: failed to restart child bridge ${username} (${e.message}).`)
        }
      }
      restart.childBridges = anyFailed ? 'failed' : 'done'
    }

    await this.journalService.finishRun(restart)
    return restart
  }

  /**
   * A stand-in for the ws client performPackageUpdate narrates to. Keeps the
   * last chunk of output so failed items carry evidence into the journal
   * (which caps the tail again at write time), and forwards every chunk to
   * the progress event stream.
   */
  private makeOutputCollector(name: string): { client: EventEmitter, getLogTail: () => string[] } {
    const client = new EventEmitter()
    let buffer = ''
    client.on('stdout', (data: string | Buffer) => {
      buffer = (buffer + String(data)).slice(-16384)
      this.emitEvent('stdout', { name, data: String(data) })
    })
    return {
      client,
      getLogTail: () => buffer.split(/\r?\n/).map(x => x.trim()).filter(Boolean),
    }
  }
}
