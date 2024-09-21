import { ApiService } from '@/app/core/api.service'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { SettingsService } from '@/app/core/settings.service'
import { BackupComponent } from '@/app/modules/settings/backup/backup.component'
import { RemoveAllAccessoriesComponent } from '@/app/modules/settings/remove-all-accessories/remove-all-accessories.component'
import { RemoveSingleAccessoryComponent } from '@/app/modules/settings/remove-single-accessory/remove-single-accessory.component'
import { RestoreComponent } from '@/app/modules/settings/restore/restore.component'
import { SelectNetworkInterfacesComponent } from '@/app/modules/settings/select-network-interfaces/select-network-interfaces.component'
import { UnpairAllBridgesComponent } from '@/app/modules/settings/unpair-all-bridges/unpair-all-bridges.component'
import { UnpairSingleBridgeComponent } from '@/app/modules/settings/unpair-single-bridge/unpair-single-bridge.component'
import { Component, OnInit } from '@angular/core'
import { FormControl, FormGroup, UntypedFormControl } from '@angular/forms'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

@Component({
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  public originalServiceForm = {
    HOMEBRIDGE_DEBUG: false,
    HOMEBRIDGE_KEEP_ORPHANS: false,
    HOMEBRIDGE_INSECURE: true,
    ENV_DEBUG: '',
    ENV_NODE_OPTIONS: '',
  }

  public originalMdnsSetting = ''
  public originalBridgeNetworkAdapters: string[] = []

  public hasChangedService = false
  public hasChangedMdns = false
  public hasChangedBridgeNetworkAdapters = false

  public serviceForm = new FormGroup({
    HOMEBRIDGE_DEBUG: new FormControl(false),
    HOMEBRIDGE_KEEP_ORPHANS: new FormControl(false),
    HOMEBRIDGE_INSECURE: new FormControl(true),
    ENV_DEBUG: new FormControl(''),
    ENV_NODE_OPTIONS: new FormControl(''),
  })

  public legacyMdnsFormControl = new UntypedFormControl(false)
  public showAvahiMdnsOption = false
  public showResolvedMdnsOption = false
  public availableNetworkAdapters: Record<string, any> = []
  public bridgeNetworkAdapters: Record<string, any> = []
  public isHbV2 = false
  public showFields = {
    general: true,
    startup: true,
    network: true,
    reset: true,
    cache: true,
  }

  constructor(
    public $settings: SettingsService,
    private $api: ApiService,
    public $toastr: ToastrService,
    private $modal: NgbModal,
    public $plugin: ManagePluginsService,
    private $translate: TranslateService,
  ) {}

  ngOnInit() {
    this.isHbV2 = this.$settings.env.homebridgeVersion.startsWith('2')
    this.initNetworkingOptions()
    if (this.$settings.env.serviceMode) {
      this.initServiceModeForm()
    }
  }

  onLangChange(newLang: string) {
    this.$settings.setLang(newLang)

    // save the theme to the server
    this.$api.put('/config-editor/ui', { key: 'lang', value: newLang }).toPromise().catch((err) => {
      this.$toastr.error(err.message, 'Failed to save language')
    })
  }

  onThemeChange(newTheme: string) {
    this.$settings.setTheme(newTheme)

    // save the theme to the server
    this.$api.put('/config-editor/ui', { key: 'theme', value: newTheme }).toPromise().catch((err) => {
      this.$toastr.error(err.message, 'Failed to save theme')
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

  initServiceModeForm() {
    this.$api.get('/platform-tools/hb-service/homebridge-startup-settings').subscribe({
      next: (data) => {
        Object.keys(data).forEach((key) => {
          this.originalServiceForm[key] = data[key]
        })
        this.serviceForm.patchValue(data)
        this.serviceForm.valueChanges.pipe(debounceTime(500)).subscribe(this.saveServiceModeSettings.bind(this))
      },
      error: (err) => {
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  saveServiceModeSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', data).subscribe({
      next: () => {
        this.hasChangedService = JSON.stringify(data) !== JSON.stringify(this.originalServiceForm)
      },
      error: (err) => {
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'))
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
    ]).then(([system, adapters, mdnsAdvertiser]) => {
      this.availableNetworkAdapters = system
      this.buildBridgeNetworkAdapterList(adapters)
      this.legacyMdnsFormControl.patchValue(mdnsAdvertiser.advertiser)
      this.originalMdnsSetting = mdnsAdvertiser.advertiser
      this.originalBridgeNetworkAdapters = this.bridgeNetworkAdapters.map((x: any) => x.iface)
      this.legacyMdnsFormControl.valueChanges.subscribe((advertiser: string) => {
        this.setHomebridgeMdnsSetting(advertiser)
      })
    })
  }

  async setHomebridgeMdnsSetting(advertiser: string) {
    this.$api.put('/server/mdns-advertiser', { advertiser }).subscribe({
      next: () => {
        this.hasChangedMdns = advertiser !== this.originalMdnsSetting
      },
      error: (err) => {
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'))
      },
    })
  }

  async setNetworkInterfaces(adapters: string[]) {
    this.$api.put('/server/network-interfaces/bridge', { adapters }).subscribe({
      next: () => {
        this.hasChangedBridgeNetworkAdapters = this.originalBridgeNetworkAdapters.join(',') !== adapters.join(',')
      },
      error: (err) => {
        this.$toastr.error(err.message, this.$translate.instant('toast.title_error'))
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
