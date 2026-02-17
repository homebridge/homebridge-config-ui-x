import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ChildBridgeStatusResponse, HomebridgeStatus, HomebridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { ChildBridgeWithUIState, Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bridges-widget.component.html',
  styleUrl: './bridges-widget.component.scss',
  standalone: true,
  imports: [
    NgbTooltip,
    TranslatePipe,
  ],
})
export class BridgesWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)

  // Signals
  readonly widget = input.required<Widget>()
  public readonly homebridgeStatus = signal<Partial<HomebridgeStatusResponse & { name?: string }> | null>(null)
  public readonly childBridges = signal<ChildBridgeWithUIState[]>([])
  public readonly isRestarting = signal<boolean>(false)

  // Other properties
  private ioMain: IoNamespace
  private ioChild: IoNamespace
  public isAdmin = this.$auth.user.admin
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.ioMain = this.$ws.connectToNamespace('status')

    this.ioMain.socket.on('homebridge-status', (data: HomebridgeStatusResponse) => {
      this.homebridgeStatus.set(data)
      if (data.status === 'ok') {
        this.isRestarting.set(false)
      }
    })

    this.ioMain.connected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getHomebridgeStatus()
    })

    this.ioMain.socket.on('disconnect', () => {
      this.homebridgeStatus.update(status => ({ ...status, status: HomebridgeStatus.DOWN }))
    })

    this.ioChild = this.$ws.connectToNamespace('child-bridges')

    this.ioChild.connected.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getChildBridgeMetadata()
      this.ioChild.socket.emit('monitor-child-bridge-status')
    })

    this.ioChild.socket.on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
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
    })

    // Fetch initial data if already connected
    if (this.ioMain.socket.connected) {
      void this.getHomebridgeStatus()
    }

    if (this.ioChild.socket.connected) {
      this.getChildBridgeMetadata()
      this.ioChild.socket.emit('monitor-child-bridge-status')
    }
  }

  public async restartChildBridge(bridge: ChildBridgeWithUIState): Promise<void> {
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
      }, 15000)
    }
  }

  public async restartHomebridge(): Promise<void> {
    this.isRestarting.set(true)
    try {
      await this.$api.put('/server/restart', {})
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('restart.toast_server_restart_error'), this.$translate.instant('toast.title_error'))
    } finally {
      setTimeout(() => {
        this.isRestarting.set(false)
      }, 15000)
    }
  }

  public ngOnDestroy(): void {
    if (this.ioMain) {
      this.ioMain.end()
    }
    if (this.ioChild) {
      this.ioChild.end()
    }
  }

  private async getHomebridgeStatus(): Promise<void> {
    const data = await firstValueFrom(this.ioMain.request('get-homebridge-status'))
    this.homebridgeStatus.set(data)
  }

  private getChildBridgeMetadata(): void {
    this.ioChild.request('get-homebridge-child-bridge-status')
      .subscribe((data: ChildBridgeStatusResponse[]) => {
        this.childBridges.set(data.map(bridge => ({ ...bridge, restarting: false })).sort((a, b) => a.name.localeCompare(b.name)))
      })
  }
}
