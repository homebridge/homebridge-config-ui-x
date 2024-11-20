import { ApiService } from '@/app/core/api.service'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveBridgeAccessoriesComponent } from '@/app/modules/settings/remove-bridge-accessories/remove-bridge-accessories.component'
import { RemoveSingleAccessoryComponent } from '@/app/modules/settings/remove-single-accessory/remove-single-accessory.component'
import { RestoreComponent } from '@/app/modules/settings/restore/restore.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { UnpairAllBridgesComponent } from '@/app/modules/settings/unpair-all-bridges/unpair-all-bridges.component'
import { UnpairSingleBridgeComponent } from '@/app/modules/settings/unpair-single-bridge/unpair-single-bridge.component'
import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, UntypedFormControl } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

@Component({
  templateUrl: './settings.component.html',
  imports: [
    NgClass,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TitleCasePipe,
    TranslatePipe,
  ],
})
export class SettingsComponent implements OnInit {
  private $api = inject(ApiService)
  private $modal = inject(NgbModal)
  private $plugin = inject(ManagePluginsService)
  $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public originalServiceForm = {
    HOMEBRIDGE_DEBUG: false,
    HOMEBRIDGE_KEEP_ORPHANS: false,
    HOMEBRIDGE_INSECURE: true,
    ENV_DEBUG: '',
    ENV_NODE_OPTIONS: '',
  }

  public originalUiSettingsForm = {
    port: 0,
  }

  public originalLoginWallpaper = ''
  public originalMdnsSetting = ''
  public originalBridgeNetworkAdapters: string[] = []
  public originalHbPort = 0

  public hasChangedService = false
  public hasChangedUiSettings = false
  public hasChangedMdns = false
  public hasChangedBridgeNetworkAdapters = false
  public hasChangedHbPort = false
  public hasChangedLoginWallpaper = false

  public isInvalidHbPort = false
  public isInvalidHbUiPort = false

  public serviceForm = new FormGroup({
    HOMEBRIDGE_DEBUG: new FormControl(false),
    HOMEBRIDGE_KEEP_ORPHANS: new FormControl(false),
    HOMEBRIDGE_INSECURE: new FormControl(true),
    ENV_DEBUG: new FormControl(''),
    ENV_NODE_OPTIONS: new FormControl(''),
  })

  public uiSettingsForm = new FormGroup({
    port: new FormControl(0),
  })

  public loginWallpaper = ''
  public legacyMdnsFormControl = new UntypedFormControl(false)
  public showAvahiMdnsOption = false
  public showResolvedMdnsOption = false
  public availableNetworkAdapters: any[] = []
  public bridgeNetworkAdapters: string[] = []
  public hbPortFormControl = new FormControl(0)
  public isHbV2 = false
  public showFields = {
    general: true,
    display: true,
    startup: true,
    network: true,
    reset: true,
    cache: true,
  }

  ngOnInit() {
    this.isHbV2 = this.$settings.env.homebridgeVersion.startsWith('2')
    this.initUiSettingsForm()
    this.initDisplaySettingsForm()
    this.initNetworkingOptions()
    if (this.$settings.env.serviceMode) {
      this.initServiceModeForm()
    }
  }

  initUiSettingsForm() {
    this.originalUiSettingsForm = {
      port: this.$settings.env.port,
    }
    this.uiSettingsForm.patchValue({
      port: this.$settings.env.port,
    })
    this.uiSettingsForm.valueChanges.pipe(debounceTime(500)).subscribe((data) => {
      let hasChangedUiSettings = false
      Object.keys(data).forEach((key) => {
        if (this.originalUiSettingsForm[key] !== data[key]) {
          this.saveUiSettingChange(key, data[key])
          hasChangedUiSettings = true
        }
      })
      this.hasChangedUiSettings = hasChangedUiSettings
    })
  }

  initServiceModeForm() {
    this.$api.get('/platform-tools/hb-service/homebridge-startup-settings').subscribe({
      next: (data) => {
        Object.keys(data).forEach((key) => {
          this.originalServiceForm[key] = data[key]
        })
        this.serviceForm.patchValue(data)
        this.serviceForm.valueChanges.pipe(debounceTime(500)).subscribe(this.saveServiceModeSettings.bind(this))
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  initDisplaySettingsForm() {
    this.originalLoginWallpaper = this.$settings.loginWallpaper
    this.loginWallpaper = this.$settings.loginWallpaper
  }

  saveUiSettingChange(key: string, value: any) {
    // Extra things to do per key
    switch (key) {
      case 'lang':
        this.$settings.setLang(value)
        break
      case 'lightingMode':
        this.$settings.setLightingMode(value, 'user')
        break
      case 'theme':
        this.$settings.setTheme(value)
        break
      case 'tempUnits':
        this.$settings.setEnvItem('temperatureUnits', value)
        break
      case 'loginWallpaper':
        this.$settings.setEnvItem('loginWallpaper', value)
        this.hasChangedLoginWallpaper = value !== this.originalLoginWallpaper
        break
      case 'port':
        if (!value || typeof value !== 'number' || value < 1025 || value > 65533 || Number.isInteger(value) === false || value === this.hbPortFormControl.value) {
          this.isInvalidHbUiPort = true
          return
        }
        this.$settings.setEnvItem('port', value)
        this.isInvalidHbUiPort = false
        break
    }

    // save the new property to the config file
    firstValueFrom(this.$api.put('/config-editor/ui', { key, value }))
      .catch((error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      })
  }

  openUiSettings() {
    this.$plugin.settings({
      name: 'homebridge-config-ui-x',
      displayName: 'Homebridge UI',
      settingsSchema: true,
      links: {},
    })
  }

  openRestoreModal() {
    this.$modal.open(RestoreComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  openBackupModal() {
    this.$modal.open(BackupComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  saveServiceModeSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', data).subscribe({
      next: () => {
        this.hasChangedService = JSON.stringify(data) !== JSON.stringify(this.originalServiceForm)
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  resetHomebridgeState() {
    this.$modal.open(UnpairAllBridgesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  unpairAccessory() {
    this.$modal.open(UnpairSingleBridgeComponent, {
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

  removeSingleCachedAccessories() {
    this.$modal.open(RemoveSingleAccessoryComponent, {
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

  async initNetworkingOptions() {
    try {
      this.getNetworkSettings()
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
    } catch (e) {}
  }

  async getNetworkSettings() {
    return Promise.all([
      firstValueFrom(this.$api.get('/server/network-interfaces/system')),
      firstValueFrom(this.$api.get('/server/network-interfaces/bridge')),
      firstValueFrom(this.$api.get('/server/mdns-advertiser')),
      firstValueFrom(this.$api.get('/server/port')),
    ]).then(([system, adapters, mdnsAdvertiser, port]) => {
      this.availableNetworkAdapters = system
      this.buildBridgeNetworkAdapterList(adapters)
      this.legacyMdnsFormControl.patchValue(mdnsAdvertiser.advertiser)
      this.originalMdnsSetting = mdnsAdvertiser.advertiser
      this.originalBridgeNetworkAdapters = this.bridgeNetworkAdapters.map((x: any) => x.iface)
      this.legacyMdnsFormControl.valueChanges.subscribe((advertiser: string) => {
        this.setHomebridgeMdnsSetting(advertiser)
      })
      this.hbPortFormControl.patchValue(port.port)
      this.hbPortFormControl.valueChanges.subscribe((port: number) => this.setHomebridgePort(port))
      this.originalHbPort = port.port
    })
  }

  async setHomebridgeMdnsSetting(advertiser: string) {
    this.$api.put('/server/mdns-advertiser', { advertiser }).subscribe({
      next: () => {
        this.hasChangedMdns = advertiser !== this.originalMdnsSetting
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  async setNetworkInterfaces(adapters: string[]) {
    this.$api.put('/server/network-interfaces/bridge', { adapters }).subscribe({
      next: () => {
        this.hasChangedBridgeNetworkAdapters = this.originalBridgeNetworkAdapters.join(',') !== adapters.join(',')
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  async setHomebridgePort(port: number) {
    if (port === this.uiSettingsForm.get('port').value) {
      this.isInvalidHbPort = true
      return
    }

    this.$api.put('/server/port', { port }).subscribe({
      next: () => {
        this.hasChangedHbPort = this.originalHbPort !== port
        this.isInvalidHbPort = false
      },
      error: () => {
        this.isInvalidHbPort = true
      },
    })
  }

  buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.bridgeNetworkAdapters = []
      return
    }

    this.bridgeNetworkAdapters = adapters.map((interfaceName) => {
      const i = this.availableNetworkAdapters.find((x: any) => x.iface === interfaceName)
      if (i) {
        i.selected = true
        i.missing = false
        return i
      } else {
        return {
          iface: interfaceName,
          missing: true,
        }
      }
    })
  }

  selectNetworkInterfaces() {
    const ref = this.$modal.open(SelectNetworkInterfacesComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    ref.componentInstance.availableNetworkAdapters = this.availableNetworkAdapters
    ref.componentInstance.bridgeNetworkAdapters = this.bridgeNetworkAdapters

    ref.result
      .then((adapters: string[]) => {
        this.buildBridgeNetworkAdapterList(adapters)
        this.setNetworkInterfaces(adapters)
      })
      .catch(() => {
        // do nothing
      })
  }

  toggleSection(section: string) {
    this.showFields[section] = !this.showFields[section]
  }
}
