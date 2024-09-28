import { ApiService } from '@/app/core/api.service'
import { RestartHomebridgeComponent } from '@/app/core/components/restart-homebridge/restart-homebridge.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, Input, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

@Component({
  templateUrl: './plugin-bridge.component.html',
  styleUrls: ['./plugin-bridge.component.scss'],
})
export class PluginBridgeComponent implements OnInit {
  @Input() plugin: any
  @Input() schema: any

  public canConfigure = true
  public configBlocks: any[] = []
  public enabledBlocks: Record<number, boolean> = {}
  public bridgeCache: Map<number, Record<string, any>> = new Map()
  public deviceInfo: Map<string, any> = new Map()
  public showConfigFields: boolean[] = []
  public saveInProgress = false
  public canShowBridgeDebug = false

  constructor(
    public $activeModal: NgbActiveModal,
    private $api: ApiService,
    private $modal: NgbModal,
    private $plugins: ManagePluginsService,
    private $router: Router,
    public $settings: SettingsService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) {}

  ngOnInit(): void {
    this.loadPluginConfig()
    this.canShowBridgeDebug = this.$settings.env.homebridgeVersion.startsWith('2')
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe({
      next: (configBlocks) => {
        this.configBlocks = configBlocks
        for (const [i, block] of this.configBlocks.entries()) {
          if (block._bridge && block._bridge.username) {
            this.enabledBlocks[i] = true
            block._bridge.env = block._bridge.env || {}
            this.bridgeCache.set(i, block._bridge)
            this.getDeviceInfo(block._bridge.username)
          }
        }
      },
      error: () => {
        this.canConfigure = false
      },
    })
  }

  async toggleExternalBridge(block: any, enable: boolean, index: number) {
    if (!enable) {
      delete block._bridge
      return
    }

    const bridgeCache = this.bridgeCache.get(index)

    block._bridge = {
      username: bridgeCache ? bridgeCache.username : this.generateUsername(),
      port: await this.getUnusedPort(),
      name: bridgeCache?.name,
      model: bridgeCache?.model,
      manufacturer: bridgeCache?.manufacturer,
      firmwareRevision: bridgeCache?.firmwareRevision,
      debugModeEnabled: bridgeCache?.debugModeEnabled,
      env: bridgeCache?.env,
    }

    this.bridgeCache.set(index, block._bridge)
    await this.getDeviceInfo(block._bridge.username)
  }

  async getUnusedPort() {
    this.saveInProgress = true
    try {
      const lookup = await firstValueFrom(this.$api.get('/server/port/new'))
      return lookup.port
    } catch (e) {
      return Math.floor(Math.random() * (60000 - 30000 + 1) + 30000)
    } finally {
      this.saveInProgress = false
    }
  }

  async getDeviceInfo(username: string) {
    try {
      this.deviceInfo[username] = await firstValueFrom(this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`))
    } catch (e) {
      this.deviceInfo[username] = false
    }
  }

  async save() {
    this.saveInProgress = true

    try {
      await firstValueFrom(this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.configBlocks))
      this.$activeModal.close()
      this.$modal.open(RestartHomebridgeComponent, {
        size: 'lg',
        backdrop: 'static',
      })
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('config.toast_failed_to_save_config'), this.$translate.instant('toast.title_error'))
    } finally {
      this.saveInProgress = false
    }
  }

  openPluginConfig() {
    // Close the existing modal
    this.$activeModal.close()

    // Open the plugin config modal
    this.$plugins.settings({
      name: this.plugin.name,
      settingsSchema: true,
      links: {},
    })
  }

  /**
   * Generates a new random username
   */
  public generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  openFullConfigEditor() {
    this.$router.navigate(['/config'])
    this.$activeModal.close()
  }

  toggleConfigFields(index: number) {
    this.showConfigFields[index] = !this.showConfigFields[index]
  }
}
