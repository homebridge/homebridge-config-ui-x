import { ApiService } from '@/app/core/api.service'
import { ManagePluginsService } from '@/app/core/manage-plugins/manage-plugins.service'
import { NotificationService } from '@/app/core/notification.service'
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
import { ToastrService } from 'ngx-toastr'
import { debounceTime } from 'rxjs/operators'

@Component({
  templateUrl: './settings.component.html',
})
export class SettingsComponent implements OnInit {
  public serviceForm = new FormGroup({
    HOMEBRIDGE_DEBUG: new FormControl(false),
    HOMEBRIDGE_KEEP_ORPHANS: new FormControl(false),
    HOMEBRIDGE_INSECURE: new FormControl(true),
    ENV_DEBUG: new FormControl(null),
    ENV_NODE_OPTIONS: new FormControl(null),
  })

  public legacyMdnsFormControl = new UntypedFormControl(false)
  public saved = false

  public showAvahiMdnsOption = false
  public showResolvedMdnsOption = false
  public availableNetworkAdapters: Record<string, any> = []
  public bridgeNetworkAdapters: Record<string, any> = []
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
    private $notification: NotificationService,
    public $toastr: ToastrService,
    private $modal: NgbModal,
    public $plugin: ManagePluginsService,
  ) {}

  ngOnInit() {
    this.initNetworkingOptions()
    if (this.$settings.env.serviceMode) {
      this.initServiceModeForm()
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
    this.$api.get('/platform-tools/hb-service/homebridge-startup-settings').subscribe(
      (data) => {
        this.serviceForm.patchValue(data)
        this.serviceForm.valueChanges.pipe(debounceTime(500)).subscribe(this.saveServiceModeSettings.bind(this))
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to load startup settings')
      },
    )
  }

  saveServiceModeSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', data).subscribe(() => {
      this.saved = true
      this.$notification.configUpdated.next(undefined)
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
      this.$api.get('/server/network-interfaces/system').toPromise(),
      this.$api.get('/server/network-interfaces/bridge').toPromise(),
      this.$api.get('/server/mdns-advertiser').toPromise(),
    ]).then(([system, adapters, mdnsAdvertiser]) => {
      this.availableNetworkAdapters = system
      this.buildBridgeNetworkAdapterList(adapters)
      this.legacyMdnsFormControl.patchValue(mdnsAdvertiser.advertiser)
      this.legacyMdnsFormControl.valueChanges.subscribe((advertiser: string) => {
        this.setHomebridgeMdnsSetting(advertiser)
      })
    })
  }

  async setHomebridgeMdnsSetting(advertiser: string) {
    this.$api.put('/server/mdns-advertiser', { advertiser }).subscribe(
      () => {
        this.saved = true
        this.$notification.configUpdated.next(undefined)
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set mdns advertiser.')
      },
    )
  }

  async setNetworkInterfaces(adapters: string[]) {
    this.$api.put('/server/network-interfaces/bridge', { adapters }).subscribe(
      () => {
        this.saved = true
        this.$notification.configUpdated.next(undefined)
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set network adapters.')
      },
    )
  }

  buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.bridgeNetworkAdapters = []
      return
    }

    this.bridgeNetworkAdapters = adapters.map((interfaceName) => {
      const i = this.availableNetworkAdapters.find(x => x.iface === interfaceName)
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
