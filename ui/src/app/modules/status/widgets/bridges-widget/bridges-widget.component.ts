import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { ChildBridgeStatusResponse, HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './bridges-widget.component.html',
  styleUrls: ['./bridges-widget.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    NgbTooltip,
    TranslatePipe,
  ],
})
export class BridgesWidgetComponent implements OnInit, OnDestroy {
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private ioMain: IoNamespace
  private ioChild: IoNamespace

  @Input() widget: Widget

  public homebridgeStatus = {} as any
  public childBridges: any[] = []
  public isRestarting = false
  public isAdmin = this.$auth.user.admin

  // Live region state
  public homebridgeLiveMessage = ''
  public childBridgeLiveMessages: Record<string, string> = {}

  // Track last known statuses so we can detect "pending -> something else"
  private lastHomebridgeStatus: string | undefined
  private lastChildStatuses: Record<string, string | undefined> = {}

  // Delayed announcement timers
  private homebridgeAnnouncementTimeout: any
  private childAnnouncementTimeouts: Record<string, any> = {}

  // Only announce when *user* explicitly requested a restart
  private homebridgeRestartRequested = false
  private childRestartRequested: Record<string, boolean> = {}

  // Ensure we only schedule one announcement per restart request
  private homebridgeAnnouncementPending = false
  private childAnnouncementPending: Record<string, boolean> = {}

  public async ngOnInit(): Promise<void> {
    this.ioMain = this.$ws.getExistingNamespace('status')

    this.ioMain.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      const prevStatus = this.lastHomebridgeStatus

      this.homebridgeStatus = data
      this.lastHomebridgeStatus = data.status

      // Existing behavior: clear isRestarting when HB reports ok
      if (data.status === 'ok') {
        this.isRestarting = false
      }

      this.updateHomebridgeLiveMessage(prevStatus)
    })

    this.ioMain.connected.subscribe(async () => {
      const prevStatus = this.lastHomebridgeStatus
      await this.getHomebridgeStatus()
      this.lastHomebridgeStatus = this.homebridgeStatus?.status
      this.updateHomebridgeLiveMessage(prevStatus)
    })

    if (this.ioMain.socket.connected) {
      const prevStatus = this.lastHomebridgeStatus
      await this.getHomebridgeStatus()
      this.lastHomebridgeStatus = this.homebridgeStatus?.status
      this.updateHomebridgeLiveMessage(prevStatus)
    }

    this.ioMain.socket.on('disconnect', () => {
      const prevStatus = this.lastHomebridgeStatus
      this.homebridgeStatus.status = 'down'
      this.lastHomebridgeStatus = 'down'
      this.updateHomebridgeLiveMessage(prevStatus)
    })

    this.ioChild = this.$ws.connectToNamespace('child-bridges')

    this.ioChild.connected.subscribe(async () => {
      this.getChildBridgeMetadata()
      this.ioChild.socket.emit('monitor-child-bridge-status')
    })

    this.ioChild.socket.on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
      const key = data.username || data.name
      const prevStatus = this.lastChildStatuses[key]

      const existingBridge = this.childBridges.find(x => x.username === data.username)

      if (existingBridge) {
        Object.assign(existingBridge, data)

        // Existing behavior: clear restarting when bridge reports ok
        if (data.status === 'ok') {
          existingBridge.restarting = false
        }

        this.lastChildStatuses[key] = data.status
        this.updateChildBridgeLiveMessage(existingBridge, prevStatus)
      } else {
        this.childBridges.push(data)
        this.childBridges.sort((a, b) => a.name.localeCompare(b.name))

        this.lastChildStatuses[key] = data.status
        this.updateChildBridgeLiveMessage(data, prevStatus)
      }
    })
  }

  public async restartChildBridge(bridge: any) {
    const key = bridge.username || bridge.name
    this.childRestartRequested[key] = true
    this.childAnnouncementPending[key] = false

    try {
      bridge.restarting = true

      await firstValueFrom(this.ioChild.request('restart-child-bridge', bridge.username))
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        this.$translate.instant('status.widget.bridge.restart_error'),
        this.$translate.instant('toast.title_error'),
      )
    } finally {
      // Keep original timer behavior; announcements are driven by status changes
      setTimeout(() => {
        bridge.restarting = false
        // If no proper status transition ever came, stop considering this restart active
        this.childRestartRequested[key] = false
        this.childAnnouncementPending[key] = false
      }, 15000)
    }
  }

  public restartHomebridge() {
    this.homebridgeRestartRequested = true
    this.homebridgeAnnouncementPending = false
    this.isRestarting = true

    this.$api.put('/server/restart', {}).subscribe({
      error: (error: any) => {
        console.error(error)
        this.$toastr.error(
          this.$translate.instant('restart.toast_server_restart_error'),
          this.$translate.instant('toast.title_error'),
        )
      },
    })

    // Keep original timer behavior; announcements are driven by status changes
    setTimeout(() => {
      this.isRestarting = false
      this.homebridgeRestartRequested = false
      this.homebridgeAnnouncementPending = false
    }, 15000)
  }

  public ngOnDestroy(): void {
    this.ioMain.end()
    this.ioChild.end()

    // Clear any pending announcement timers
    if (this.homebridgeAnnouncementTimeout) {
      clearTimeout(this.homebridgeAnnouncementTimeout)
    }
    for (const key of Object.keys(this.childAnnouncementTimeouts)) {
      clearTimeout(this.childAnnouncementTimeouts[key])
    }
  }

  private async getHomebridgeStatus() {
    this.homebridgeStatus = await firstValueFrom(this.ioMain.request('get-homebridge-status'))
  }

  private getChildBridgeMetadata() {
    this.ioChild.request('get-homebridge-child-bridge-status').subscribe((data: ChildBridgeStatusResponse[]) => {
      this.childBridges = data.sort((a, b) => a.name.localeCompare(b.name))

      for (const bridge of this.childBridges) {
        const key = bridge.username || bridge.name
        this.lastChildStatuses[key] = bridge.status
        this.childAnnouncementPending[key] = false
        this.childRestartRequested[key] = false
      }
    })
  }

  /**
   * Homebridge live message:
   * When status goes from 'pending' -> not 'pending' *and* a restart was
   * explicitly requested (and we haven't already scheduled an announcement
   * for this restart), wait 3 seconds, then look at the *current* status
   * and announce with that. Only once per restart click.
   */
  private updateHomebridgeLiveMessage(prevStatus?: string): void {
    const currentStatus = this.homebridgeStatus?.status

    if (
      this.homebridgeRestartRequested &&
      !this.homebridgeAnnouncementPending &&
      prevStatus === 'pending' &&
      currentStatus &&
      currentStatus !== 'pending'
    ) {
      // We are now handling this restart; don't schedule multiple announcements.
      this.homebridgeAnnouncementPending = true

      if (this.homebridgeAnnouncementTimeout) {
        clearTimeout(this.homebridgeAnnouncementTimeout)
      }

      this.homebridgeAnnouncementTimeout = setTimeout(() => {
        const latestStatus = this.homebridgeStatus?.status
        if (!latestStatus || latestStatus === 'pending') {
          // Still not stable; treat this attempt as handled but don't speak.
          this.homebridgeRestartRequested = false
          this.homebridgeAnnouncementPending = false
          return
        }

        let statusLabel: string | undefined

        if (latestStatus === 'down') {
          statusLabel = this.$translate.instant('status.services.label_not_running')
        } else if (latestStatus === 'ok') {
          statusLabel = this.$translate.instant('status.services.label_running')
        } else {
          statusLabel = latestStatus
        }

        const name = this.homebridgeStatus?.name || 'Homebridge'
        const msg = statusLabel
          ? `${name} restart complete, ${statusLabel}`
          : `${name} restart complete`

        this.homebridgeLiveMessage = msg

        // This restart has now been "announced"
        this.homebridgeRestartRequested = false
        this.homebridgeAnnouncementPending = false

        setTimeout(() => {
          if (this.homebridgeLiveMessage === msg) {
            this.homebridgeLiveMessage = ''
          }
        }, 3000)
      }, 3000)
    }
  }

  /**
   * Child bridge live message:
   * Same logic as homebridge: when status goes 'pending' -> not 'pending'
   * AND a restart was explicitly requested for this bridge, and we haven't
   * already scheduled an announcement for this restart, wait 3 seconds,
   * then announce with the *current* status at that time. Only once per click.
   */
  private updateChildBridgeLiveMessage(bridge: any, prevStatus?: string): void {
    const currentStatus = bridge.status
    const key = bridge.username || bridge.name

    if (
      this.childRestartRequested[key] &&
      !this.childAnnouncementPending[key] &&
      prevStatus === 'pending' &&
      currentStatus &&
      currentStatus !== 'pending'
    ) {
      this.childAnnouncementPending[key] = true

      if (this.childAnnouncementTimeouts[key]) {
        clearTimeout(this.childAnnouncementTimeouts[key])
      }

      this.childAnnouncementTimeouts[key] = setTimeout(() => {
        const latestBridge =
          this.childBridges.find(b => b.username === bridge.username) || bridge

        const latestStatus = latestBridge.status
        if (!latestStatus || latestStatus === 'pending') {
          // Still not stable; treat this attempt as handled but don't speak.
          this.childRestartRequested[key] = false
          this.childAnnouncementPending[key] = false
          return
        }

        let statusLabel: string | undefined

        if (latestStatus === 'down') {
          statusLabel = this.$translate.instant('status.services.label_not_running')
        } else if (latestStatus === 'ok') {
          statusLabel = this.$translate.instant('status.services.label_running')
        } else {
          statusLabel = latestStatus
        }

        const msg = statusLabel
          ? `${latestBridge.name} restart complete, ${statusLabel}`
          : `${latestBridge.name} restart complete`

        this.childBridgeLiveMessages[key] = msg

        // This restart has now been "announced" for this bridge
        this.childRestartRequested[key] = false
        this.childAnnouncementPending[key] = false

        setTimeout(() => {
          if (this.childBridgeLiveMessages[key] === msg) {
            this.childBridgeLiveMessages[key] = ''
          }
        }, 3000)
      }, 3000)
    }
  }
}
