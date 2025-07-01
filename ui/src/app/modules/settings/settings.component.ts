import { animate, style, transition, trigger } from '@angular/animations'
import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule, UntypedFormControl } from '@angular/forms'
import { Router, RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ApiService } from '@/app/core/api.service'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { AccessoryControlListsComponent } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.component'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'
import { ResetAllBridgesComponent } from '@/app/modules/settings/reset-all-bridges/reset-all-bridges.component'
import { ResetIndividualBridgesComponent } from '@/app/modules/settings/reset-individual-bridges/reset-individual-bridges.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { WallpaperComponent } from '@/app/modules/settings/wallpaper/wallpaper.component'

interface NetworkAdapterAvailable {
  carrierChanges?: number
  default?: boolean
  dhcp?: boolean
  dnsSuffix?: string
  duplex?: string
  ieee8021xAuth?: string
  ieee8021xState?: string
  iface: string
  ifaceName: string
  internal: boolean
  ip4: string
  ip4subnet: string
  ip6: string
  ip6subnet: string
  mac: string
  mtu: number
  missing?: boolean
  operstate: string
  selected: boolean
  speed: number
  type: string
  virtual?: boolean
}

interface NetworkAdapterSelected {
  iface: string
  missing: boolean
  selected: true
  ip4?: string
  ip6?: string
}

@Component({
  templateUrl: './settings.component.html',
  standalone: true,
  imports: [
    NgClass,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TitleCasePipe,
    TranslatePipe,
    SpinnerComponent,
  ],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('750ms', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('750ms', style({ opacity: 0 })),
      ]),
    ]),
  ],
})
export class SettingsComponent implements OnInit {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  private $router = inject(Router)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  private restartToastIsShown = false

  public showFields = {
    general: true,
    display: true,
    startup: true,
    network: true,
    security: true,
    reset: true,
    cache: true,
  }

  public loading = true
  public isHbV2 = false
  public showAvahiMdnsOption = false
  public showResolvedMdnsOption = false
  public adaptersAvailable: NetworkAdapterAvailable[] = []
  public adaptersSelected: NetworkAdapterSelected[] = []
  public showPfxPassphrase = false

  public hbNameIsInvalid = false
  public hbNameIsSaving = false
  public hbNameFormControl = new FormControl('')

  public uiLangIsSaving = false
  public uiLangFormControl = new FormControl('')

  public uiThemeIsSaving = false
  public uiThemeFormControl = new FormControl('')

  public uiLightIsSaving = false
  public uiLightFormControl = new FormControl('')

  public uiMenuIsSaving = false
  public uiMenuFormControl = new FormControl('')

  public uiTempIsSaving = false
  public uiTempFormControl = new FormControl('')

  public hbDebugIsSaving = false
  public hbDebugFormControl = new FormControl(false)

  public hbInsecureIsSaving = false
  public hbInsecureFormControl = new FormControl(false)

  public hbKeepIsSaving = false
  public hbKeepFormControl = new FormControl(false)

  public hbEnvDebugIsSaving = false
  public hbEnvDebugFormControl = new FormControl('')

  public hbEnvNodeIsSaving = false
  public hbEnvNodeFormControl = new FormControl('')

  public hbLogSizeIsInvalid = false
  public hbLogSizeIsSaving = false
  public hbLogSizeFormControl = new FormControl(-1)

  public hbLogTruncateIsInvalid = false
  public hbLogTruncateIsSaving = false
  public hbLogTruncateFormControl = new FormControl(0)

  public hbMDnsIsSaving = false
  public hbMDnsFormControl = new FormControl('')

  public hbPortIsInvalid = false
  public hbPortIsSaving = false
  public hbPortFormControl = new FormControl(0)

  public hbStartPortIsInvalid = false
  public hbStartPortIsSaving = false
  public hbStartPortFormControl = new FormControl(0)

  public hbEndPortIsInvalid = false
  public hbEndPortIsSaving = false
  public hbEndPortFormControl = new FormControl(0)

  public uiPortIsInvalid = false
  public uiPortIsSaving = false
  public uiPortFormControl = new FormControl(0)

  public uiAuthIsSaving = false
  public uiAuthFormControl = new UntypedFormControl(true)

  public uiSessionTimeoutIsInvalid = false
  public uiSessionTimeoutIsSaving = false
  public uiSessionTimeoutFormControl = new FormControl(0)

  public uiSslTypeFormControl = new FormControl('off')

  public uiSslKeyIsSaving = false
  public uiSslKeyFormControl = new FormControl('')

  public uiSslCertIsSaving = false
  public uiSslCertFormControl = new FormControl('')

  public uiSslPfxIsSaving = false
  public uiSslPfxFormControl = new FormControl('')

  public uiSslPassphraseIsSaving = false
  public uiSslPassphraseFormControl = new FormControl('')

  public uiHostIsSaving = false
  public uiHostFormControl = new FormControl('')

  public uiProxyHostIsSaving = false
  public uiProxyHostFormControl = new FormControl('')

  public hbPackageIsSaving = false
  public hbPackageFormControl = new FormControl('')

  public uiMetricsIsSaving = false
  public uiMetricsFormControl = new FormControl(true)

  public uiAccDebugIsSaving = false
  public uiAccDebugFormControl = new FormControl(false)

  public uiTempFileIsSaving = false
  public uiTempFileFormControl = new FormControl('')

  public hbLinuxShutdownIsSaving = false
  public hbLinuxShutdownFormControl = new FormControl('')

  public hbLinuxRestartIsSaving = false
  public hbLinuxRestartFormControl = new FormControl('')

  public readonly linkDebug = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Debug-Common-Values" target="_blank"><i class="fa fa-fw fa-external-link-alt primary-text"></i></a>'

  constructor() {}

  async ngOnInit() {
    this.isHbV2 = this.$settings.env.homebridgeVersion.startsWith('2')

    await this.initNetworkingOptions()

    if (this.$settings.env.serviceMode) {
      await this.initServiceModeForm()
    }

    this.hbNameFormControl.patchValue(this.$settings.env.homebridgeInstanceName)
    this.hbNameFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbNameSave(value))

    this.uiLangFormControl.patchValue(this.$settings.env.lang)
    this.uiLangFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiLangSave(value))

    this.uiThemeFormControl.patchValue(this.$settings.theme)
    this.uiThemeFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiThemeSave(value))

    this.uiLightFormControl.patchValue(this.$settings.lightingMode)
    this.uiLightFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: 'auto' | 'light' | 'dark') => this.uiLightSave(value))

    this.uiMenuFormControl.patchValue(this.$settings.menuMode)
    this.uiMenuFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: 'default' | 'freeze') => this.uiMenuSave(value))

    this.uiTempFormControl.patchValue(this.$settings.env.temperatureUnits)
    this.uiTempFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiTempSave(value))

    this.hbLogSizeFormControl.patchValue(this.$settings.env.log?.maxSize)
    this.hbLogSizeFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.hbLogSizeSave(value))

    this.hbLogTruncateFormControl.patchValue(this.$settings.env.log?.truncateSize)
    this.hbLogTruncateFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.hbLogTruncateSave(value))

    this.uiPortFormControl.patchValue(this.$settings.env.port)
    this.uiPortFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: number) => this.uiPortSave(value))

    this.uiAuthFormControl.patchValue(this.$settings.formAuth)
    this.uiAuthFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiAuthSave(value))

    this.uiSessionTimeoutFormControl.patchValue(this.$settings.sessionTimeout)
    this.uiSessionTimeoutFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: number) => this.uiSessionTimeoutSave(value))

    this.uiSslKeyFormControl.patchValue(this.$settings.env.ssl?.key || '')
    this.uiSslKeyFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslKeySave(value))

    this.uiSslCertFormControl.patchValue(this.$settings.env.ssl?.cert || '')
    this.uiSslCertFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslCertSave(value))

    this.uiSslPfxFormControl.patchValue(this.$settings.env.ssl?.pfx || '')
    this.uiSslPfxFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslPfxSave(value))

    this.uiSslPassphraseFormControl.patchValue(this.$settings.env.ssl?.passphrase || '')
    this.uiSslPassphraseFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiSslPassphraseSave(value))

    this.uiSslTypeFormControl.patchValue(this.uiSslKeyFormControl.value || this.uiSslCertFormControl.value
      ? 'keycert'
      : (this.uiSslPfxFormControl.value || this.uiSslPassphraseFormControl.value) ? 'pfx' : 'off')
    this.uiSslTypeFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: string) => this.uiSslTypeSave(value))

    this.uiHostFormControl.patchValue(this.$settings.env.host || '')
    this.uiHostFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiHostSave(value))

    this.uiProxyHostFormControl.patchValue(this.$settings.env.proxyHost || '')
    this.uiProxyHostFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiProxyHostSave(value))

    this.hbPackageFormControl.patchValue(this.$settings.env.homebridgePackagePath || '')
    this.hbPackageFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbPackageSave(value))

    this.uiMetricsFormControl.patchValue(!this.$settings.env.disableServerMetricsMonitoring)
    this.uiMetricsFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiMetricsSave(value))

    this.uiAccDebugFormControl.patchValue(this.$settings.env.accessoryControl?.debug)
    this.uiAccDebugFormControl.valueChanges
      .pipe(debounceTime(750))
      .subscribe((value: boolean) => this.uiAccDebugSave(value))

    this.uiTempFileFormControl.patchValue(this.$settings.env.temp)
    this.uiTempFileFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.uiTempFileSave(value))

    this.hbLinuxShutdownFormControl.patchValue(this.$settings.env.linux?.shutdown)
    this.hbLinuxShutdownFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbLinuxShutdownSave(value))

    this.hbLinuxRestartFormControl.patchValue(this.$settings.env.linux?.restart)
    this.hbLinuxRestartFormControl.valueChanges
      .pipe(debounceTime(1500))
      .subscribe((value: string) => this.hbLinuxRestartSave(value))

    this.loading = false
  }

  async initServiceModeForm() {
    try {
      const serviceModeData = await firstValueFrom(this.$api.get('/platform-tools/hb-service/homebridge-startup-settings'))

      this.hbDebugFormControl.patchValue(serviceModeData.HOMEBRIDGE_DEBUG)
      this.hbDebugFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbDebugSave(value))

      this.hbInsecureFormControl.patchValue(serviceModeData.HOMEBRIDGE_INSECURE)
      this.hbInsecureFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbInsecureSave(value))

      this.hbKeepFormControl.patchValue(serviceModeData.HOMEBRIDGE_KEEP_ORPHANS)
      this.hbKeepFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: boolean) => this.hbKeepSave(value))

      this.hbEnvDebugFormControl.patchValue(serviceModeData.ENV_DEBUG)
      this.hbEnvDebugFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((value: string) => this.hbEnvDebugSave(value))

      this.hbEnvNodeFormControl.patchValue(serviceModeData.ENV_NODE_OPTIONS)
      this.hbEnvNodeFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((value: string) => this.hbEnvNodeSave(value))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async initNetworkingOptions() {
    try {
      await this.getNetworkSettings()
      const onLinux = (
        this.$settings.env.runningInLinux
        || this.$settings.env.runningInDocker
        || this.$settings.env.runningInSynologyPackage
        || this.$settings.env.runningInPackageMode
      )
      if (onLinux) {
        this.showAvahiMdnsOption = true
        this.showResolvedMdnsOption = true
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async getNetworkSettings() {
    return Promise.all([
      firstValueFrom(this.$api.get('/server/network-interfaces/system')),
      firstValueFrom(this.$api.get('/server/network-interfaces/bridge')),
      firstValueFrom(this.$api.get('/server/mdns-advertiser')),
      firstValueFrom(this.$api.get('/server/port')),
      firstValueFrom(this.$api.get('/server/ports')),
    ]).then(([system, adapters, mdnsAdvertiser, port, ports]: [NetworkAdapterAvailable[], string[], { advertiser: string }, { port: number }, { start?: number, end?: number }]) => {
      this.adaptersAvailable = system
      this.buildBridgeNetworkAdapterList(adapters)

      this.hbMDnsFormControl.patchValue(mdnsAdvertiser.advertiser)
      this.hbMDnsFormControl.valueChanges
        .pipe(debounceTime(750))
        .subscribe((value: string) => this.hbMDnsSave(value))

      this.hbPortFormControl.patchValue(port.port)
      this.hbPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbPortSave(port))

      this.hbStartPortFormControl.patchValue(ports.start)
      this.hbStartPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbStartPortSave(port))

      this.hbEndPortFormControl.patchValue(ports.end)
      this.hbEndPortFormControl.valueChanges
        .pipe(debounceTime(1500))
        .subscribe((port: number) => this.hbEndPortSave(port))
    })
  }

  async saveUiSettingChange(key: string, value: any) {
    // Save the new property to the config file
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui', { key, value }))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }

  async hbNameSave(value: string) {
    // https://github.com/homebridge/HAP-NodeJS/blob/ee41309fd9eac383cdcace39f4f6f6a3d54396f3/src/lib/util/checkName.ts#L12
    if (!value || !(/^[\p{L}\p{N}][\p{L}\p{N} ']*[\p{L}\p{N}]$/u).test(value)) {
      this.hbNameIsInvalid = true
      return
    }

    try {
      this.hbNameIsSaving = true
      await firstValueFrom(this.$api.put('/server/name', { name: value }))
      this.$settings.setEnvItem('homebridgeInstanceName', value)
      this.hbNameIsInvalid = false
      setTimeout(() => {
        this.hbNameIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbNameIsSaving = false
    }
  }

  async uiLangSave(value: string) {
    try {
      this.uiLangIsSaving = true
      this.$settings.setLang(value)
      await this.saveUiSettingChange('lang', value)
      setTimeout(() => {
        this.uiLangIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiLangIsSaving = false
    }
  }

  async uiThemeSave(value: string) {
    try {
      this.uiThemeIsSaving = true
      this.$settings.setTheme(value)
      await this.saveUiSettingChange('theme', value)
      setTimeout(() => {
        this.uiThemeIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiThemeIsSaving = false
    }
  }

  async uiLightSave(value: 'auto' | 'light' | 'dark') {
    try {
      this.uiLightIsSaving = true
      this.$settings.setLightingMode(value, 'user')
      await this.saveUiSettingChange('lightingMode', value)
      setTimeout(() => {
        this.uiLightIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiLightIsSaving = false
    }
  }

  async uiMenuSave(value: 'default' | 'freeze') {
    try {
      this.uiMenuIsSaving = true
      this.$settings.setMenuMode(value)
      await this.saveUiSettingChange('menuMode', value)
      window.location.reload()
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiMenuIsSaving = false
    }
  }

  async uiTempSave(value: string) {
    try {
      this.uiTempIsSaving = true
      this.$settings.setEnvItem('temperatureUnits', value)
      await this.saveUiSettingChange('tempUnits', value)
      setTimeout(() => {
        this.uiTempIsSaving = false
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTempIsSaving = false
    }
  }

  async hbDebugSave(value: boolean) {
    try {
      this.hbDebugIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbDebugIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbDebugIsSaving = false
    }
  }

  async hbInsecureSave(value: boolean) {
    try {
      this.hbInsecureIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbInsecureIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbInsecureIsSaving = false
    }
  }

  async hbKeepSave(value: boolean) {
    try {
      this.hbKeepIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbKeepIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbKeepIsSaving = false
    }
  }

  async hbEnvDebugSave(value: string) {
    try {
      this.hbEnvDebugIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: value,
        ENV_NODE_OPTIONS: this.hbEnvNodeFormControl.value,
      }))
      setTimeout(() => {
        this.hbEnvDebugIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEnvDebugIsSaving = false
    }
  }

  async hbEnvNodeSave(value: string) {
    try {
      this.hbEnvNodeIsSaving = true
      await firstValueFrom(this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', {
        HOMEBRIDGE_DEBUG: this.hbDebugFormControl.value,
        HOMEBRIDGE_KEEP_ORPHANS: this.hbKeepFormControl.value,
        HOMEBRIDGE_INSECURE: this.hbInsecureFormControl.value,
        ENV_DEBUG: this.hbEnvDebugFormControl.value,
        ENV_NODE_OPTIONS: value,
      }))
      setTimeout(() => {
        this.hbEnvNodeIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEnvNodeIsSaving = false
    }
  }

  async hbLogSizeSave(value: number) {
    if (value && (typeof value !== 'number' || value < -1 || Number.isInteger(value) === false)) {
      this.hbLogSizeIsInvalid = true
      return
    }

    try {
      this.hbLogSizeIsSaving = true
      this.$settings.setEnvItem('log.maxSize', value)
      if (!value || value === -1) {
        // If the value is -1, we set the log.maxSize to undefined
        // This will remove the setting from the config file
        await this.saveUiSettingChange('log.truncateSize', null)
        this.hbLogTruncateIsInvalid = false
      }
      await this.saveUiSettingChange('log.maxSize', value)
      this.hbLogSizeIsInvalid = false
      setTimeout(() => {
        this.hbLogSizeIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLogSizeIsSaving = false
    }
  }

  async hbLogTruncateSave(value: number) {
    if (value && (typeof value !== 'number' || value < 0 || Number.isInteger(value) === false)) {
      this.hbLogTruncateIsInvalid = true
      return
    }

    try {
      this.hbLogTruncateIsSaving = true
      this.$settings.setEnvItem('log.truncateSize', value)
      await this.saveUiSettingChange('log.truncateSize', value)
      this.hbLogTruncateIsInvalid = false
      setTimeout(() => {
        this.hbLogTruncateIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLogTruncateIsSaving = false
    }
  }

  async hbMDnsSave(value: string) {
    try {
      this.hbMDnsIsSaving = true
      await firstValueFrom(this.$api.put('/server/mdns-advertiser', { advertiser: value }))
      setTimeout(() => {
        this.hbMDnsIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbMDnsIsSaving = false
    }
  }

  async hbPortSave(value: number) {
    if (value === this.uiPortFormControl.value) {
      this.hbPortIsInvalid = true
      return
    }

    try {
      this.hbPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/port', { port: value }))
      this.hbPortIsInvalid = false
      setTimeout(() => {
        this.hbPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbPortIsSaving = false
    }
  }

  async hbStartPortSave(value: number) {
    try {
      this.hbStartPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/ports', { start: value, end: this.hbEndPortFormControl.value }))
      this.hbStartPortIsInvalid = false
      setTimeout(() => {
        this.hbStartPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbStartPortIsSaving = false
    }
  }

  async hbEndPortSave(value: number) {
    try {
      this.hbEndPortIsSaving = true
      await firstValueFrom(this.$api.put('/server/ports', { start: this.hbStartPortFormControl.value, end: value }))
      this.hbEndPortIsInvalid = false
      setTimeout(() => {
        this.hbEndPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbEndPortIsSaving = false
    }
  }

  async uiPortSave(value: number) {
    if (!value || typeof value !== 'number' || value < 1025 || value > 65533 || Number.isInteger(value) === false || value === this.hbPortFormControl.value) {
      this.uiPortIsInvalid = true
      return
    }

    try {
      this.uiPortIsSaving = true
      this.$settings.setEnvItem('port', value)
      await this.saveUiSettingChange('port', value)
      this.uiPortIsInvalid = false
      setTimeout(() => {
        this.uiPortIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiPortIsSaving = false
    }
  }

  async uiAuthSave(value: boolean) {
    try {
      this.uiAuthIsSaving = true
      this.$settings.setItem('formAuth', value)
      await this.saveUiSettingChange('auth', value ? 'form' : 'none')
      setTimeout(() => {
        this.uiAuthIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiAuthIsSaving = false
    }
  }

  async uiSessionTimeoutSave(value: number) {
    if (value && (typeof value !== 'number' || value < 600 || value > 86400000 || Number.isInteger(value) === false)) {
      this.uiSessionTimeoutIsInvalid = true
      return
    }

    try {
      this.uiSessionTimeoutIsSaving = true
      this.$settings.setItem('sessionTimeout', value)
      await this.saveUiSettingChange('sessionTimeout', value)
      this.uiSessionTimeoutIsInvalid = false
      setTimeout(() => {
        this.uiSessionTimeoutIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSessionTimeoutIsSaving = false
    }
  }

  async uiSslKeySave(value: string) {
    try {
      this.uiSslKeyIsSaving = true
      this.$settings.setEnvItem('ssl.key', value)
      await this.saveUiSettingChange('ssl.key', value)
      setTimeout(() => {
        this.uiSslKeyIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslKeyIsSaving = false
    }
  }

  async uiSslCertSave(value: string) {
    try {
      this.uiSslCertIsSaving = true
      this.$settings.setEnvItem('ssl.cert', value)
      await this.saveUiSettingChange('ssl.cert', value)
      setTimeout(() => {
        this.uiSslCertIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslCertIsSaving = false
    }
  }

  async uiSslPfxSave(value: string) {
    try {
      this.uiSslPfxIsSaving = true
      this.$settings.setEnvItem('ssl.pfx', value)
      await this.saveUiSettingChange('ssl.pfx', value)
      setTimeout(() => {
        this.uiSslPfxIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslPfxIsSaving = false
    }
  }

  async uiSslPassphraseSave(value: string) {
    try {
      this.uiSslPassphraseIsSaving = true
      this.$settings.setEnvItem('ssl.passphrase', value)
      await this.saveUiSettingChange('ssl.passphrase', value)
      setTimeout(() => {
        this.uiSslPassphraseIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiSslPassphraseIsSaving = false
    }
  }

  async uiSslTypeSave(value: string) {
    switch (value) {
      case 'keycert':
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        break
      case 'pfx':
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        break
      default:
        this.uiSslKeyFormControl.patchValue('', { emitEvent: false })
        this.uiSslCertFormControl.patchValue('', { emitEvent: false })
        this.uiSslPfxFormControl.patchValue('', { emitEvent: false })
        this.uiSslPassphraseFormControl.patchValue('', { emitEvent: false })
        this.$settings.setEnvItem('ssl.key', '')
        this.$settings.setEnvItem('ssl.cert', '')
        this.$settings.setEnvItem('ssl.pfx', '')
        this.$settings.setEnvItem('ssl.passphrase', '')
        await this.saveUiSettingChange('ssl', '')
        this.showRestartToast()
    }
  }

  async uiHostSave(value: string) {
    try {
      this.uiHostIsSaving = true
      this.$settings.setEnvItem('host', value)
      await this.saveUiSettingChange('host', value)
      setTimeout(() => {
        this.uiHostIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiHostIsSaving = false
    }
  }

  async uiProxyHostSave(value: string) {
    try {
      this.uiProxyHostIsSaving = true
      this.$settings.setEnvItem('proxyHost', value)
      await this.saveUiSettingChange('proxyHost', value)
      setTimeout(() => {
        this.uiProxyHostIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiProxyHostIsSaving = false
    }
  }

  async hbPackageSave(value: string) {
    try {
      this.hbPackageIsSaving = true
      this.$settings.setEnvItem('homebridgePackagePath', value)
      await this.saveUiSettingChange('homebridgePackagePath', value)
      setTimeout(() => {
        this.hbPackageIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbPackageIsSaving = false
    }
  }

  async uiMetricsSave(value: boolean) {
    try {
      this.uiMetricsIsSaving = true
      this.$settings.setEnvItem('disableServerMetricsMonitoring', !value)
      await this.saveUiSettingChange('disableServerMetricsMonitoring', !value)
      setTimeout(() => {
        this.uiMetricsIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiMetricsIsSaving = false
    }
  }

  async uiAccDebugSave(value: boolean) {
    try {
      this.uiAccDebugIsSaving = true
      this.$settings.setEnvItem('accessoryControl.debug', value)
      await this.saveUiSettingChange('accessoryControl.debug', value)
      setTimeout(() => {
        this.uiAccDebugIsSaving = false
        this.showRestartToast()
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiAccDebugIsSaving = false
    }
  }

  async uiTempFileSave(value: string) {
    try {
      this.uiTempFileIsSaving = true
      this.$settings.setEnvItem('temp', value)
      await this.saveUiSettingChange('temp', value)
      setTimeout(() => {
        this.uiTempFileIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.uiTempFileIsSaving = false
    }
  }

  async hbLinuxShutdownSave(value: string) {
    try {
      this.hbLinuxShutdownIsSaving = true
      this.$settings.setEnvItem('linux.shutdown', value)
      await this.saveUiSettingChange('linux.shutdown', value)
      setTimeout(() => {
        this.hbLinuxShutdownIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLinuxShutdownIsSaving = false
    }
  }

  async hbLinuxRestartSave(value: string) {
    try {
      this.hbLinuxRestartIsSaving = true
      this.$settings.setEnvItem('linux.restart', value)
      await this.saveUiSettingChange('linux.restart', value)
      setTimeout(() => {
        this.hbLinuxRestartIsSaving = false
        this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe({
          next: () => this.showRestartToast(),
          error: (error) => {
            console.error(error)
            this.showRestartToast()
          },
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.hbLinuxRestartIsSaving = false
    }
  }

  openUiSettings() {
    this.$plugin.settings({
      name: 'homebridge-config-ui-x',
      displayName: 'Homebridge UI',
      settingsSchema: true,
      links: {},
    })
  }

  openBackupModal() {
    this.$modal.open(BackupComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  openWallpaperModal() {
    this.$modal.open(WallpaperComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  resetHomebridgeState() {
    this.$modal.open(ResetAllBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  unpairAccessory() {
    this.$modal.open(ResetIndividualBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  removeAllCachedAccessories() {
    this.$modal.open(RemoveAllAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  async accessoryUiControl() {
    try {
      const ref = this.$modal.open(AccessoryControlListsComponent, {
        size: 'lg',
        backdrop: 'static',
      })

      ref.componentInstance.existingBlacklist = this.$settings.env.accessoryControl?.instanceBlacklist || []

      await ref.result
      this.showRestartToast()
    } catch (error) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    }
  }

  removeSingleCachedAccessories() {
    this.$modal.open(RemoveIndividualAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  removeBridgeAccessories() {
    this.$modal.open(RemoveBridgeAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  async selectNetworkInterfaces() {
    const ref = this.$modal.open(SelectNetworkInterfacesComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.adaptersAvailable = this.adaptersAvailable

    try {
      const adapters: string[] = await ref.result
      this.buildBridgeNetworkAdapterList(adapters)
      await firstValueFrom(this.$api.put('/server/network-interfaces/bridge', { adapters }))
      this.showRestartToast()
    } catch (error) {
      if (error !== 'Dismiss') {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      }
    }
  }

  buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.adaptersSelected = []
      return
    }

    this.adaptersSelected = adapters.map((interfaceName) => {
      const i = this.adaptersAvailable.find(x => x.iface === interfaceName)
      if (i) {
        return {
          iface: i.iface,
          selected: true,
          missing: false,
          ip4: i.ip4,
          ip6: i.ip6,
        }
      } else {
        return {
          iface: interfaceName,
          selected: true,
          missing: true,
        }
      }
    })
  }

  toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section]
  }

  showRestartToast() {
    if (!this.restartToastIsShown) {
      this.restartToastIsShown = true
      const ref = this.$toastr.info(
        this.$translate.instant('settings.changes.saved'),
        this.$translate.instant('menu.hbrestart.title'),
        {
          timeOut: 0,
          tapToDismiss: true,
          disableTimeOut: true,
          positionClass: 'toast-bottom-right',
          enableHtml: true,
        },
      )

      if (ref && ref.onTap) {
        ref.onTap.subscribe(() => {
          this.$router.navigate(['/restart'])
        })
      }
    }
  }
}
