import type { Terminal } from '@xterm/xterm'

import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subscription } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ChildBridgeIconSource, ChildBridgeStatusIconsComponent } from '@/app/core/components/child-bridge-status-icons/child-bridge-status-icons.component'
import { SettingsService } from '@/app/core/ui/settings.service'
import { UpdateAllItemRowComponent } from '@/app/core/update-all/update-all-item-row.component'
import { UPDATE_ALL_MODAL_DATA, UpdateAllItemStatus, UpdateAllJournal, UpdateAllJournalItem, UpdateAllPlan, UpdateAllPlanItem, UpdateAllSnapshot } from '@/app/core/update-all/update-all.interfaces'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'

/** A row on screen: a journal item, or a plan item the user left unticked */
interface UpdateAllRow extends UpdateAllJournalItem {
  /** Unticked before the run, so it is shown with a disabled toggle rather than a status */
  excluded?: boolean
}

/**
 * The Update All modal, across all of its phases. The same list of rows carries
 * the whole run: in `plan` each row has a toggle, and from `progress` onwards
 * the toggle is replaced by that item's status. Keeping one component - and one
 * list - is what lets the rows stay put when the run starts, instead of one
 * modal closing and another opening over it.
 *
 * `plan` fetches the plan, lets the user untick anything, and starts the run.
 * The server re-validates the confirmed list against a fresh plan, so this
 * component never chooses versions - it only echoes the plan's `to` back.
 *
 * From `progress` on it renders the journal's item list live (driven by the
 * `update-all` ws namespace) with the npm output streaming into a terminal
 * pane. When the run finishes - or when it was already finished, as after the
 * UI restarts itself and reopens this with `resume` - it shows the summary, and
 * acknowledges the journal on dismissal so the summary appears exactly once.
 *
 * Reconnect-safe by design: the `connected` subject fires on every
 * (re)connect and each firing re-sends `subscribe`, so a fresh server-side
 * socket after a UI self-restart is re-registered and the snapshot re-syncs
 * anything missed. Duplicated events are harmless - item statuses are
 * idempotent.
 */
@Component({
  selector: 'app-update-all-modal',
  imports: [ChildBridgeStatusIconsComponent, TranslatePipe, UpdateAllItemRowComponent],
  standalone: true,
  templateUrl: './update-all-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateAllModalComponent implements OnInit, OnDestroy {
  private $terminals = inject(TERMINAL_FACTORY)
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private $router = inject(Router)

  private io: IoNamespace | null = null
  private term: Terminal | null = null
  private fitAddon = this.$terminals.createFitAddon()
  private connectedSub: Subscription | null = null
  private listenersAttached = false
  // Kept so ngOnDestroy can detach exactly our listeners - the namespace
  // socket is cached and shared, so removeAllListeners() is off limits
  private readonly socketListeners: Array<[string, (...args: any[]) => void]> = []

  /** Set by the caller to reopen an existing run, skipping the plan phase */
  private readonly resume = inject(UPDATE_ALL_MODAL_DATA, { optional: true })?.resume ?? false

  public readonly phase = signal<'loading' | 'plan' | 'progress' | 'summary'>('loading')

  // ---- plan phase ----
  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly starting = signal(false)
  public readonly plan = signal<UpdateAllPlan>({ items: [], needsReview: [], skipped: [] })
  public readonly showNeedsReview = signal(false)
  public readonly showSkipped = signal(false)

  // Names the user has unticked - everything in the plan is ticked by default
  private readonly unticked = signal<ReadonlySet<string>>(new Set())

  public readonly selectedCount = computed(() => this.plan().items.filter(x => !this.unticked().has(x.name)).length)
  public readonly hasNeedsReview = computed(() => this.plan().needsReview.length > 0)
  public readonly hasSkipped = computed(() => this.plan().skipped.length > 0)

  /**
   * What the finale will restart for the CURRENT selection, mirroring its
   * rules: Homebridge itself or any main-bridge plugin -> one Homebridge
   * restart (which covers every child bridge, so none are counted then);
   * otherwise just the child bridges of the selected plugins. The UI
   * restarting itself is independent of both.
   */
  public readonly restartPlan = computed(() => {
    // While the run is on, anything already failed or skipped will not restart
    // anything, so the line narrows as the run goes - which is exactly what the
    // finale will do with the same information.
    const selected = this.phase() === 'plan'
      ? this.plan().items.filter(x => !this.unticked().has(x.name))
      : this.rows().filter(x => !x.excluded && x.status !== 'failed' && x.status !== 'skipped')
    const ui = selected.some(x => x.type === 'ui')
    const homebridge = selected.some(x => x.type === 'homebridge'
      || (x.type === 'plugin' && (x.childBridgeUsernames?.length ?? 0) === 0))
    const childBridgeCount = homebridge
      ? 0
      : new Set(selected.flatMap(x => x.childBridgeUsernames ?? [])).size
    return { ui, homebridge, childBridgeCount }
  })

  /**
   * The rows on screen, one shape for every phase: the plan's items while
   * confirming (as `planned`, which is exactly what they are), the journal's
   * items once the run is under way. Keeping one type is what lets the same
   * `@for` carry both, so nothing re-renders when the run starts.
   */
  public readonly rows = computed<UpdateAllRow[]>(() => {
    const planItems = this.plan().items
    if (this.phase() === 'plan') {
      return planItems.map(x => ({ ...x, status: 'planned' as const }))
    }

    // Once running, the plan's order is what keeps every row where the user last
    // saw it. Unticked items are not in the journal, so they stay as themselves,
    // marked excluded - they keep their (now disabled) toggle instead of a status.
    const journal = this.journal()
    if (!planItems.length) {
      // A resumed run: there is no plan to order by, only the journal
      return journal?.items ?? []
    }
    const byName = new Map((journal?.items ?? []).map(x => [x.name, x]))
    return planItems.map(x => byName.get(x.name) ?? { ...x, status: 'planned' as const, excluded: this.unticked().has(x.name) })
  })

  // ---- run phases ----
  public readonly journal = signal<UpdateAllJournal | null>(null)
  public readonly cancelRequested = signal(false)
  public readonly disconnected = signal(false)

  /** Child bridges this run restarted, and the ones confirmed back up */
  private ioChild: IoNamespace | null = null
  private childListeners: Array<[string, (...args: any[]) => void]> = []
  private childRestartTimer: ReturnType<typeof setTimeout> | null = null
  public readonly restartingBridges = signal<string[]>([])
  public readonly restartedBridges = signal<string[]>([])
  /** The last status payload seen per bridge, so the icons can show HAP/Matter state */
  private readonly bridgeStates = signal<Record<string, ChildBridgeIconSource>>({})

  /** True while this modal is following child bridges back, so the summary does not repeat it */
  public readonly watchingBridges = computed(() => this.restartingBridges().length > 0)

  /** Failure reasons, listed under the rows rather than squeezed into them */
  public readonly failureReasons = computed(() => (this.journal()?.items ?? [])
    .filter(x => x.status === 'failed' && x.reason)
    .map(x => ({ name: x.name, displayName: x.displayName || x.name, reason: x.reason! })))

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  public ngOnInit(): void {
    if (this.resume) {
      this.enterRun()
      return
    }
    void this.loadPlan()
  }

  /** Fetch the plan and show it for confirmation */
  private async loadPlan(): Promise<void> {
    try {
      const plan = await this.$api.get<UpdateAllPlan>('/update-all/plan')
      // Defensive: the template reads `plan().items` directly, so a malformed
      // or empty response must still leave a plan shape behind
      this.plan.set({
        items: plan?.items ?? [],
        needsReview: plan?.needsReview ?? [],
        skipped: plan?.skipped ?? [],
      })
      this.phase.set('plan')
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.$activeModal.dismiss('Dismiss')
    }
  }

  public isTicked(name: string): boolean {
    return !this.unticked().has(name)
  }

  public toggleItem(name: string): void {
    const next = new Set(this.unticked())
    if (next.has(name)) {
      next.delete(name)
    } else {
      next.add(name)
    }
    this.unticked.set(next)
  }

  public handleIconError(item: UpdateAllPlanItem): void {
    item.icon = this.defaultIcon
  }

  /**
   * Start the run and move this same modal on to the progress phase. The rows
   * already on screen stay exactly where they are - only their right-hand cell
   * changes from a toggle to a status.
   */
  public async confirm(): Promise<void> {
    if (this.selectedCount() === 0 || this.starting()) {
      return
    }
    this.starting.set(true)
    const items = this.plan().items.filter(x => this.isTicked(x.name)).map(x => ({ name: x.name, to: x.to }))

    try {
      await this.$api.post('/update-all/start', { items })
      this.enterRun()
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.starting.set(false)
    }
  }

  /** Attach to the run's ws feed - from a fresh start, or from `resume` */
  private enterRun(): void {
    // Deliberately NOT back to 'loading' when coming from the plan: the rows are
    // already on screen and must stay there. `rows()` keeps showing the ticked
    // plan items until the journal's own list arrives to replace them.
    if (this.phase() === 'plan') {
      this.phase.set('progress')
    }
    this.io = this.$ws.connectToNamespace('update-all')
    this.connectedSub = this.io.connected!.subscribe(() => {
      this.disconnected.set(false)
      void this.subscribeToRun()
    })
    this.attachSocketListeners()
  }

  public ngOnDestroy(): void {
    this.connectedSub?.unsubscribe()
    for (const [event, handler] of this.socketListeners) {
      this.io?.socket.off(event, handler)
    }
    this.term?.dispose()
    this.io?.end?.()
    if (this.childRestartTimer) {
      clearTimeout(this.childRestartTimer)
    }
    for (const [event, handler] of this.childListeners) {
      this.ioChild?.socket.off(event, handler)
    }
    this.ioChild?.end?.()
  }

  private async subscribeToRun(): Promise<void> {
    try {
      const snapshot: UpdateAllSnapshot = await firstValueFrom(this.io!.request('subscribe'))
      this.journal.set(snapshot.journal)
      if (snapshot.active) {
        this.phase.set('progress')
        // the terminal pane only exists once the progress branch has rendered
        setTimeout(() => this.initTerminal(), 0)
      } else {
        await this.showSummary()
      }
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.$activeModal.dismiss('Dismiss')
    }
  }

  private attachSocketListeners(): void {
    if (this.listenersAttached) {
      return
    }
    this.listenersAttached = true

    const on = (event: string, handler: (...args: any[]) => void) => {
      this.socketListeners.push([event, handler])
      this.io!.socket.on(event, handler)
    }

    on('item-start', (payload: { name: string }) => this.setItemStatus(payload.name, 'running'))
    on('item-result', (payload: { name: string, status: UpdateAllItemStatus }) => this.setItemStatus(payload.name, payload.status))
    on('stdout', (payload: { name: string, data: string }) => this.term?.write(payload.data))
    on('run-complete', () => void this.showSummary())
    // While the UI updates itself the server goes away for a few seconds -
    // say so instead of appearing frozen. The reconnect re-subscribes above.
    on('disconnect', () => this.disconnected.set(true))
  }

  private setItemStatus(name: string, status: UpdateAllItemStatus): void {
    const journal = this.journal()
    if (!journal) {
      return
    }
    this.journal.set({
      ...journal,
      items: journal.items.map(x => x.name === name ? { ...x, status } : x),
    })
  }

  /**
   * What the right-hand slot should show while the child bridges this run
   * touched are coming back. Null for every other row and every other phase,
   * so the normal item status shows instead.
   */
  public restartStatusFor(item: UpdateAllJournalItem): 'restarting' | 'restarted' | null {
    const usernames = item.childBridgeUsernames
    if (!usernames?.length || item.status !== 'ok') {
      return null
    }
    if (!this.restartingBridges().length && !this.restartedBridges().length) {
      return null
    }
    const done = this.restartedBridges()
    return usernames.every(x => done.includes(x)) ? 'restarted' : 'restarting'
  }

  /** Re-read the journal from disk for the final statuses and restart outcomes */
  private async showSummary(): Promise<void> {
    let journal = this.journal()
    try {
      const fresh = await this.$api.get<UpdateAllJournal | null>('/update-all/journal')
      if (fresh) {
        journal = fresh
        this.journal.set(fresh)
      }
    } catch (error: any) {
      console.error(error)
    }

    // Homebridge and/or the UI going down is the restart page's job - it already
    // knows how to wait for both to come back. `restarting` tells it the restart
    // is under way so it does not trigger a second one.
    const restart = journal?.restart
    const homebridgeRestarting = restart?.homebridge === 'done' || restart?.homebridge === 'failed'
    const uiRestarting = restart?.ui === 'scheduled'
    if (homebridgeRestarting || uiRestarting) {
      this.$activeModal.close()
      void this.$router.navigate(['/restart'], {
        queryParams: {
          restarting: 'true',
          ...(uiRestarting ? { uiRestarting: 'true' } : {}),
        },
      })
      return
    }

    // Only child bridges restarted, so the modal stays put and follows them
    // back one by one, in place of each plugin's update status.
    if (restart?.childBridges === 'done') {
      const usernames = [...new Set((journal?.items ?? [])
        .filter(x => x.status === 'ok')
        .flatMap(x => x.childBridgeUsernames ?? []))]
      if (usernames.length) {
        this.watchChildBridges(usernames)
      }
    }

    this.phase.set('summary')
  }

  /**
   * Follow the restarted child bridges back using the same signal the bridges
   * widget uses - the server's restart call is fire-and-forget, so its journal
   * entry means "requested", and only this event means "actually back".
   */
  /**
   * The bridges behind one plugin row, shaped for the shared status icons. The
   * live payloads arrive on the ws feed; until one does, a bridge is shown as
   * restarting, which is what it is.
   */
  public bridgeIconSourcesFor(item: UpdateAllJournalItem): Array<ChildBridgeIconSource & { username: string }> {
    const known = this.bridgeStates()
    return (item.childBridgeUsernames ?? []).map(username => ({
      username,
      ...(known[username] ?? {}),
      status: known[username]?.status ?? 'pending',
      restarting: !this.restartedBridges().includes(username),
    }))
  }

  private watchChildBridges(usernames: string[]): void {
    this.restartingBridges.set(usernames)
    this.ioChild = this.$ws.connectToNamespace('child-bridges')

    const on = (event: string, handler: (...args: any[]) => void) => {
      this.childListeners.push([event, handler])
      this.ioChild!.socket.on(event, handler)
    }

    on('child-bridge-status-update', (data: ChildBridgeIconSource & { username?: string }) => {
      if (!data?.username || !usernames.includes(data.username)) {
        return
      }
      this.bridgeStates.set({ ...this.bridgeStates(), [data.username]: data })
      if (data.status === 'ok' && !this.restartedBridges().includes(data.username)) {
        this.restartedBridges.set([...this.restartedBridges(), data.username])
      }
    })

    this.ioChild.socket.emit('monitor-child-bridge-status')

    // A bridge that never reports back would otherwise spin for ever. The same
    // 15s the bridges widget allows, after which the rows settle as restarted.
    this.childRestartTimer = setTimeout(() => {
      this.restartedBridges.set(usernames)
    }, 15000)
  }

  private initTerminal(): void {
    if (this.term) {
      return
    }
    const target = document.getElementById('update-all-log-output')
    if (!target) {
      return
    }
    this.term = this.$terminals.createTerminal(this.$settings.getTerminalOptions({ disableStdin: true }))
    this.term.loadAddon(this.fitAddon)
    this.term.open(target)
    this.fitAddon.fit()
  }

  /** Ask the server to stop after the item npm is currently updating */
  public async cancelRun(): Promise<void> {
    this.cancelRequested.set(true)
    try {
      await this.$api.post('/update-all/cancel', {})
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.cancelRequested.set(false)
    }
  }

  /**
   * What the row should show. In the summary a `running` or `planned` status
   * can only mean the run never finished (the process died mid-run, for
   * example a power cut during the UI's own update) - showing a spinner
   * there would look alive forever, so those read as "did not finish".
   */
  public displayStatus(status: UpdateAllItemStatus): UpdateAllItemStatus | 'incomplete' {
    if (this.phase() === 'summary' && (status === 'running' || status === 'planned')) {
      return 'incomplete'
    }
    return status
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  /**
   * The single icon a row shows on the right once the run is under way. The
   * label is not rendered - it is the accessible name and the tooltip, so the
   * rows stay narrow without the state becoming mouse-only.
   */
  public rowIcon(item: UpdateAllRow): { classes: string, label: string } {
    switch (this.restartStatusFor(item)) {
      case 'restarting':
        return { classes: 'fas fa-lg fa-circle-notch fa-spin grey-text', label: 'status.services.label_restarting' }
      case 'restarted':
        return { classes: 'fas fa-lg fa-check-circle green-text', label: 'update_all.status_restarted' }
    }

    switch (this.displayStatus(item.status)) {
      case 'running':
        return { classes: 'fas fa-lg fa-circle-notch fa-spin grey-text', label: 'update_all.status_running' }
      case 'ok':
        return { classes: 'fas fa-lg fa-check-circle green-text', label: 'update_all.status_ok' }
      case 'failed':
        return { classes: 'fas fa-lg fa-times-circle red-text', label: 'update_all.status_failed' }
      case 'skipped':
        return { classes: 'fas fa-lg fa-minus-circle grey-text', label: 'update_all.status_skipped' }
      case 'incomplete':
        return { classes: 'fas fa-lg fa-minus-circle grey-text', label: 'update_all.status_incomplete' }
      default:
        return { classes: 'far fa-lg fa-circle grey-text', label: 'update_all.status_planned' }
    }
  }

  public closeModal(): void {
    if (this.phase() === 'summary') {
      // fire-and-forget: a failed ack only means the summary shows once more
      this.$api.post('/update-all/journal/ack', {}).catch(() => {})
    }
    this.$activeModal.close()
  }
}
