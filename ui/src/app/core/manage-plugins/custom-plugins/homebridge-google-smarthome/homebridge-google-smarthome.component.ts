import { ApiService } from '@/app/core/api.service'
import { NotificationService } from '@/app/core/notification.service'
import { SettingsService } from '@/app/core/settings.service'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { JwtHelperService } from '@auth0/angular-jwt'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

@Component({
  selector: 'app-homebridge-google-smarthome',
  templateUrl: './homebridge-google-smarthome.component.html',
})
export class HomebridgeGoogleSmarthomeComponent implements OnInit, OnDestroy {
  @Input() public plugin
  @Input() public schema
  @Input() pluginConfig: Record<string, any>[]

  public justLinked = false
  public gshConfig: Record<string, any>
  public linkType: string

  private linkDomain = 'https://homebridge-gsh.iot.oz.nu'
  private linkUrl = `${this.linkDomain}/link-account`
  private popup
  private originCheckInterval

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
    private $jwtHelper: JwtHelperService,
    private $api: ApiService,
    public $settings: SettingsService,
    private $notification: NotificationService,
    private $toastr: ToastrService,
  ) {
    // listen for sign in events from the link account popup
    window.addEventListener('message', this.windowMessageListener, false)
  }

  ngOnInit() {
    if (!this.pluginConfig.length) {
      this.pluginConfig.push({ name: 'Google Smart Home', platform: this.schema.pluginAlias })
    }

    this.gshConfig = this.pluginConfig[0]

    this.parseToken()
  }

  windowMessageListener = (e) => {
    if (e.origin !== this.linkDomain) {
      console.error('Refusing to process message from', e.origin)
      console.error(e)
    }

    try {
      const data = JSON.parse(e.data)
      if (data.token) {
        this.processToken(data.token)
      }
    } catch (error) {
      console.error(error)
    }
  }

  linkAccount() {
    const w = 450
    const h = 700
    const y = window.top.outerHeight / 2 + window.top.screenY - (h / 2)
    const x = window.top.outerWidth / 2 + window.top.screenX - (w / 2)
    this.popup = window.open(
      this.linkUrl,
      'oznu-google-smart-home-auth',
      'toolbar=no, location=no, directories=no, status=no, menubar=no scrollbars=no, resizable=no, copyhistory=no, '
      + `width=${w}, height=${h}, top=${y}, left=${x}`,
    )

    // simple message popup to provide the current hostname
    this.originCheckInterval = setInterval(() => {
      this.popup.postMessage('origin-check', this.linkDomain)
    }, 2000)
  }

  unlinkAccount() {
    this.gshConfig = {
      name: 'Google Smart Home',
      platform: this.schema.pluginAlias,
    }

    this.pluginConfig.splice(0, this.pluginConfig.length)
    this.saveConfig()
  }

  processToken(token) {
    clearInterval(this.originCheckInterval)
    if (this.popup) {
      this.popup.close()
    }
    this.gshConfig.token = token
    this.gshConfig.notice = 'Keep your token a secret!'

    if (!this.pluginConfig.length) {
      this.pluginConfig.push(this.gshConfig)
    }

    this.parseToken()
    this.saveConfig()
  }

  parseToken() {
    if (this.gshConfig.token) {
      try {
        const decoded = this.$jwtHelper.decodeToken(this.gshConfig.token)
        this.linkType = decoded.id.split('|')[0].split('-')[0]
      } catch (e) {
        this.$toastr.error('Invalid account linking token in config.json', this.translate.instant('toast.title_error'))
        delete this.gshConfig.token
      }
    }
  }

  async saveConfig() {
    try {
      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.pluginConfig).toPromise()
      this.justLinked = true
      this.$toastr.success(
        this.translate.instant('plugins.settings.toast_restart_required'),
        this.translate.instant('plugins.settings.toast_plugin_config_saved'),
      )
    } catch {
      this.$toastr.error(this.translate.instant('config.toast_failed_to_save_config'), this.translate.instant('toast.title_error'))
    }
  }

  async saveAndClose() {
    this.gshConfig.platform = this.schema.pluginAlias
    this.pluginConfig[0] = this.gshConfig

    await this.saveConfig()
    this.activeModal.close()
    this.$notification.configUpdated.next(undefined)
  }

  close() {
    this.activeModal.close()
  }

  ngOnDestroy() {
    clearInterval(this.originCheckInterval)
    window.removeEventListener('message', this.windowMessageListener)
    if (this.popup) {
      this.popup.close()
    }
  }
}
