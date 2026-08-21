import type { Terminal } from '@xterm/xterm'

import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subscription } from 'rxjs'

import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { UpdateAllItemStatus, UpdateAllJournal, UpdateAllSnapshot } from '@/app/core/update-all/update-all.interfaces'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { TERMINAL_FACTORY } from '@/app/core/utilities/terminal.factory'

/**
 * The Update All progress/summary modal. While a run is active it renders the
 * journal's item list live (driven by the `update-all` ws namespace) with the
 * npm output streaming into a terminal pane. When the run finishes - or when
 * it was already finished, as after the UI restarts itself - it shows the
 * summary, and acknowledges the journal on dismissal so the summary appears
 * exactly once.
 *
 * Reconnect-safe by design: the `connected` subject fires on every
 * (re)connect and each firing re-sends `subscribe`, so a fresh server-side
 * socket after a UI self-restart is re-registered and the snapshot re-syncs
 * anything missed. Duplicated events are harmless - item statuses are
 * idempotent.
 */
@Component({
  selector: 'app-update-all-progress',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './update-all-progress.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateAllProgressComponent implements OnInit, OnDestroy {
  private $terminals = inject(TERMINAL_FACTORY)
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  private io!: IoNamespace
  private term: Terminal | null = null
  private fitAddon = this.$terminals.createFitAddon()
  private connectedSub: Subscription | null = null
  private listenersAttached = false
  // Kept so ngOnDestroy can detach exactly our listeners - the namespace
  // socket is cached and shared, so removeAllListeners() is off limits
  private readonly socketListeners: Array<[string, (...args: any[]) => void]> = []

  public readonly phase = signal<'loading' | 'progress' | 'summary'>('loading')
  public readonly journal = signal<UpdateAllJournal | null>(null)
  public readonly cancelRequested = signal(false)
  public readonly disconnected = signal(false)

  public get isLightTerminalTheme(): boolean {
    return this.$settings.getEffectiveTerminalLightingMode() === 'light'
  }

  public ngOnInit(): void {
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
      this.io.socket.off(event, handler)
    }
    this.term?.dispose()
    this.io.end?.()
  }

  private async subscribeToRun(): Promise<void> {
    try {
      const snapshot: UpdateAllSnapshot = await firstValueFrom(this.io.request('subscribe'))
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
      this.io.socket.on(event, handler)
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

  /** Re-read the journal from disk for the final statuses and restart outcomes */
  private async showSummary(): Promise<void> {
    try {
      const journal = await this.$api.get<UpdateAllJournal | null>('/update-all/journal')
      if (journal) {
        this.journal.set(journal)
      }
    } catch (error: any) {
      console.error(error)
    }
    this.phase.set('summary')
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

  public closeModal(): void {
    if (this.phase() === 'summary') {
      // fire-and-forget: a failed ack only means the summary shows once more
      this.$api.post('/update-all/journal/ack', {}).catch(() => {})
    }
    this.$activeModal.close()
  }
}
