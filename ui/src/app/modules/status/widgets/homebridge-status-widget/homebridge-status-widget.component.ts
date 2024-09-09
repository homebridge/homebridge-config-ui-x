import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { IoNamespace, WsService } from '@/app/core/ws.service'
import { Component, Input, OnInit } from '@angular/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  templateUrl: './homebridge-status-widget.component.html',
  styleUrls: ['./homebridge-status-widget.component.scss'],
})
export class HomebridgeStatusWidgetComponent implements OnInit {
  @Input() widget: any

  public homebridgePkg = {} as any
  public homebridgeUiPkg = {} as any
  public homebridgeStatus = {} as any
  public homebridgePluginStatus = [] as any
  public homebridgePluginStatusDone = false as boolean

  private io: IoNamespace

  constructor(
    private $ws: WsService,
    private $settings: SettingsService,
    public $toastr: ToastrService,
    public $plugin: ManagePluginsService,
  ) {}

  async ngOnInit() {
    this.io = this.$ws.getExistingNamespace('status')
    this.io.socket.on('homebridge-status', (data) => {
      this.homebridgeStatus = data
    })

    this.io.connected.subscribe(async () => {
      await Promise.all([
        this.getHomebridgeStatus(),
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
      ])
    })

    if (this.io.socket.connected) {
      await Promise.all([
        this.getHomebridgeStatus(),
        this.checkHomebridgeVersion(),
        this.checkHomebridgeUiVersion(),
        this.getOutOfDatePlugins(),
      ])
    }

    this.io.socket.on('disconnect', () => {
      this.homebridgeStatus.status = 'down'
    })
  }

  async getHomebridgeStatus() {
    this.homebridgeStatus = await this.io.request('get-homebridge-status').toPromise()
  }

  async checkHomebridgeVersion() {
    try {
      const response = await this.io.request('homebridge-version-check').toPromise()
      this.homebridgePkg = response
      this.$settings.env.homebridgeVersion = response.installedVersion
    } catch (err) {
      this.$toastr.error(err.message)
    }
  }

  async checkHomebridgeUiVersion() {
    try {
      const response = await this.io.request('homebridge-ui-version-check').toPromise()
      this.homebridgeUiPkg = response
      this.$settings.env.homebridgeUiVersion = response.installedVersion
    } catch (err) {
      this.$toastr.error(err.message)
    }
  }

  async getOutOfDatePlugins() {
    try {
      const outOfDatePlugins = await this.io.request('get-out-of-date-plugins').toPromise()
      this.homebridgePluginStatus = outOfDatePlugins.filter(x => x.name !== 'homebridge-config-ui-x')
      this.homebridgePluginStatusDone = true
    } catch (err) {
      this.$toastr.error(err.message)
    }
  }
}
