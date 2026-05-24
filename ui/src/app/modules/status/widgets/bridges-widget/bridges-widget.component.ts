import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { TtlCacheService } from '@/app/core/caching/ttl-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ChildBridgeStatusResponse, HomebridgeStatus, HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgeWithUIState, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-bridges-widget',
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './bridges-widget.component.html',
  styleUrl: './bridges-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BridgesWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $cache = inject(TtlCacheService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  readonly widget = input.required<Widget>()
  public readonly homebridgeStatus = signal<Partial<HomebridgeStatusResponse & { name?: string }> | null>(null)
  public readonly childBridges = signal<ChildBridgeWithUIState[]>([])
  public readonly isRestarting = signal<boolean>(false)

  // Live-region state — only set when a user-initiated restart has settled
  // (transitioned from pending back to a stable status). Cleared after 3s.
  public readonly homebridgeLiveMessage = signal('')
  public readonly childBridgeLiveMessages = signal<Record<string, string>>({})

  // Other properties
  private ioMain!: IoNamespace
  private ioChild!: IoNamespace
  public isAdmin = this.$auth.user.admin
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  public isHapBridgeDisableSupported = this.$settings.isFeatureEnabled('hapBridgeDisable')

  // Track the last seen status so we can detect "pending -> stable" transitions.
  private lastHomebridgeStatus: string | undefined
  private lastChildStatuses: Record<string, string | undefined> = {}

  // Track whether the user explicitly asked for a restart; we only announce on user-initiated restarts.
  private homebridgeRestartRequested = false
  private homebridgeAnnouncementPending = false
  private homebridgeAnnouncementTimeout: ReturnType<typeof setTimeout> | null = null
  private childRestartRequested: Record<string, boolean> = {}
  private childAnnouncementPending: Record<string, boolean> = {}
  private childAnnouncementTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

  public ngOnInit(): void {
    void this.initialize()
  }

  public childHapTooltipKey(bridge: ChildBridgeWithUIState): string {
    if (this.isHapBridgeDisableSupported && bridge.hap === false) {
      return 'status.services.hap_not_enabled'
    }
    if (bridge.status === 'down' && !bridge.restarting && !this.isRestarting()) {
      return 'status.services.hap_not_running'
    }
    return 'status.services.hap_running'
  }

  public isChildHapDisabled(bridge: ChildBridgeWithUIState): boolean {
    return this.isHapBridgeDisableSupported && bridge.hap === false
  }

  public isMainHapDisabled(): boolean {
    return this.isHapBridgeDisableSupported && this.homebridgeStatus()?.hap?.enabled === false
  }

  public mainHapTooltipKey(): string {
    if (this.isMainHapDisabled()) {
      return 'status.services.hap_not_enabled'
    }
    if (this.homebridgeStatus()?.status === 'down' && !this.isRestarting()) {
      return 'status.services.hap_not_running'
    }
    return 'status.services.hap_running'
  }

  private async initialize(): Promise<void> {
    this.ioMain = this.$ws.connectToNamespace('status')

    this.ioMain.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      const prevStatus = this.lastHomebridgeStatus
      this.homebridgeStatus.set(data)
      this.lastHomebridgeStatus = data.status
      if (data.status === 'ok') {
        this.isRestarting.set(false)
      }
      this.maybeAnnounceHomebridgeRestart(prevStatus)
    })

    this.ioMain.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(async () => {
      const prevStatus = this.lastHomebridgeStatus
      await this.getHomebridgeStatus()
      this.lastHomebridgeStatus = this.homebridgeStatus()?.status
      this.maybeAnnounceHomebridgeRestart(prevStatus)
    })

    this.ioMain.socket.on('disconnect', () => {
      const prevStatus = this.lastHomebridgeStatus
      this.homebridgeStatus.update(status => ({ ...status, status: HomebridgeStatus.DOWN }))
      this.lastHomebridgeStatus = HomebridgeStatus.DOWN
      this.maybeAnnounceHomebridgeRestart(prevStatus)
    })

    this.ioChild = this.$ws.connectToNamespace('child-bridges')

    this.ioChild.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getChildBridgeMetadata()
      this.ioChild.socket.emit('monitor-child-bridge-status')
    })

    this.ioChild.socket.on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
      const key = data.username || data.name
      const prevStatus = this.lastChildStatuses[key]
      this.lastChildStatuses[key] = data.status
      this.childBridges.update((bridges) => {
        const existingIndex = bridges.findIndex(x => x.username === data.username)
        if (existingIndex !== -1) {
          const updated = [...bridges]
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...data,
            restarting: data.status === 'ok' ? false : updated[existingIndex].restarting,
          } as ChildBridgeWithUIState
          return updated
        } else {
          return [...bridges, { ...data, restarting: false } as ChildBridgeWithUIState].sort((a, b) => a.name.localeCompare(b.name))
        }
      })
      this.maybeAnnounceChildRestart(data.name || key, key, prevStatus)
    })
  }

  public async restartChildBridge(bridge: ChildBridgeWithUIState): Promise<void> {
    const key = bridge.username || bridge.name
    this.childRestartRequested[key] = true
    this.childAnnouncementPending[key] = false
    try {
      this.childBridges.update((bridges) => {
        const updated = [...bridges]
        const index = updated.findIndex(x => x.username === bridge.username)
        if (index !== -1) {
          updated[index] = { ...updated[index], restarting: true } as ChildBridgeWithUIState
        }
        return updated
      })

      await firstValueFrom(this.ioChild.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('status.widget.bridge.restart_error'), this.$translate.instant('toast.title_error'))
    } finally {
      setTimeout(() => {
        this.childBridges.update((bridges) => {
          const updated = [...bridges]
          const index = updated.findIndex(x => x.username === bridge.username)
          if (index !== -1) {
            updated[index] = { ...updated[index], restarting: false } as ChildBridgeWithUIState
          }
          return updated
        })
        this.childRestartRequested[key] = false
        this.childAnnouncementPending[key] = false
      }, 15000)
    }
  }

  public async restartHomebridge(): Promise<void> {
    this.homebridgeRestartRequested = true
    this.homebridgeAnnouncementPending = false
    this.isRestarting.set(true)
    try {
      await this.$api.put('/server/restart', {})
      this.$cache.invalidateAll()
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
    } finally {
      setTimeout(() => {
        this.isRestarting.set(false)
        this.homebridgeRestartRequested = false
        this.homebridgeAnnouncementPending = false
      }, 15000)
    }
  }

  public ngOnDestroy(): void {
    if (this.ioMain) {
      this.ioMain.end?.()
    }
    if (this.ioChild) {
      this.ioChild.end?.()
    }
    if (this.homebridgeAnnouncementTimeout) {
      clearTimeout(this.homebridgeAnnouncementTimeout)
    }
    for (const key of Object.keys(this.childAnnouncementTimeouts)) {
      clearTimeout(this.childAnnouncementTimeouts[key])
    }
  }

  // When a user-initiated restart resolves (status leaves 'pending'), wait 3s
  // for things to fully settle then announce the final state. Only once per
  // restart click.
  private maybeAnnounceHomebridgeRestart(prevStatus: string | undefined): void {
    const currentStatus = this.homebridgeStatus()?.status
    if (
      !this.homebridgeRestartRequested
      || this.homebridgeAnnouncementPending
      || prevStatus !== 'pending'
      || !currentStatus
      || currentStatus === 'pending'
    ) {
      return
    }

    this.homebridgeAnnouncementPending = true
    if (this.homebridgeAnnouncementTimeout) {
      clearTimeout(this.homebridgeAnnouncementTimeout)
    }
    this.homebridgeAnnouncementTimeout = setTimeout(() => {
      const latestStatus = this.homebridgeStatus()?.status
      if (!latestStatus || latestStatus === 'pending') {
        this.homebridgeRestartRequested = false
        this.homebridgeAnnouncementPending = false
        return
      }

      const name = this.homebridgeStatus()?.name || 'Homebridge'
      const msg = this.formatRestartCompleteMessage(name, latestStatus)
      this.homebridgeLiveMessage.set(msg)
      this.homebridgeRestartRequested = false
      this.homebridgeAnnouncementPending = false

      setTimeout(() => {
        if (this.homebridgeLiveMessage() === msg) {
          this.homebridgeLiveMessage.set('')
        }
      }, 3000)
    }, 3000)
  }

  private maybeAnnounceChildRestart(name: string, key: string, prevStatus: string | undefined): void {
    const bridge = this.childBridges().find(b => (b.username || b.name) === key)
    const currentStatus = bridge?.status
    if (
      !this.childRestartRequested[key]
      || this.childAnnouncementPending[key]
      || prevStatus !== 'pending'
      || !currentStatus
      || currentStatus === 'pending'
    ) {
      return
    }

    this.childAnnouncementPending[key] = true
    if (this.childAnnouncementTimeouts[key]) {
      clearTimeout(this.childAnnouncementTimeouts[key])
    }
    this.childAnnouncementTimeouts[key] = setTimeout(() => {
      const latest = this.childBridges().find(b => (b.username || b.name) === key)
      const latestStatus = latest?.status
      if (!latestStatus || latestStatus === 'pending') {
        this.childRestartRequested[key] = false
        this.childAnnouncementPending[key] = false
        return
      }

      const msg = this.formatRestartCompleteMessage(latest?.name || name, latestStatus)
      this.childBridgeLiveMessages.update(m => ({ ...m, [key]: msg }))
      this.childRestartRequested[key] = false
      this.childAnnouncementPending[key] = false

      setTimeout(() => {
        if (this.childBridgeLiveMessages()[key] === msg) {
          this.childBridgeLiveMessages.update(m => ({ ...m, [key]: '' }))
        }
      }, 3000)
    }, 3000)
  }

  private formatRestartCompleteMessage(name: string, status: string): string {
    let statusLabel: string | undefined
    if (status === 'down') {
      statusLabel = this.$translate.instant('status.services.label_not_running')
    } else if (status === 'ok') {
      statusLabel = this.$translate.instant('status.services.label_running')
    } else {
      statusLabel = status
    }
    return statusLabel
      ? this.$translate.instant('status.widget.bridge.restart_complete_with_status', { name, status: statusLabel })
      : this.$translate.instant('status.widget.bridge.restart_complete', { name })
  }

  private async getHomebridgeStatus(): Promise<void> {
    const data = await firstValueFrom(this.ioMain.request('get-homebridge-status'))
    this.homebridgeStatus.set(data)
  }

  private getChildBridgeMetadata(): void {
    this.ioChild.request('get-homebridge-child-bridge-status')
      .subscribe((data: ChildBridgeStatusResponse[]) => {
        this.childBridges.set(data.map(bridge => ({ ...bridge, restarting: false })).sort((a, b) => a.name.localeCompare(b.name)))
        for (const bridge of data) {
          const key = bridge.username || bridge.name
          this.lastChildStatuses[key] = bridge.status
        }
      })
  }
}
