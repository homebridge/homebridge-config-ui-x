import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, UntypedFormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { debounceTime } from 'rxjs/operators';
import * as semver from 'semver';
// eslint-disable-next-line max-len
import { RemoveAllCachedAccessoriesModalComponent } from './remove-all-cached-accessories-modal/remove-all-cached-accessories-modal.component';
// eslint-disable-next-line max-len
import { RemoveSingleCachedAccessoryModalComponent } from './remove-single-cached-accessory-modal/remove-single-cached-accessory-modal.component';
import { ResetHomebridgeModalComponent } from './reset-homebridge-modal/reset-homebridge-modal.component';
import { SelectNetworkInterfacesComponent } from './select-network-interfaces/select-network-interfaces.component';
import { UnpairAccessoryModalComponent } from './unpair-accessory-modal/unpair-accessory-modal.component';
import { ApiService } from '@/app/core/api.service';
import { NotificationService } from '@/app/core/notification.service';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  public serviceForm = new FormGroup({
    HOMEBRIDGE_DEBUG: new FormControl(false),
    HOMEBRIDGE_KEEP_ORPHANS: new FormControl(false),
    HOMEBRIDGE_INSECURE: new FormControl(true),
    ENV_DEBUG: new FormControl(null),
    ENV_NODE_OPTIONS: new FormControl(null),
  });

  public legacyMdnsFormControl = new UntypedFormControl(false);
  public saved = false;

  public showNetworking = false;
  public showAvahiMdnsOption = false;
  public showResolvedMdnsOption = false;
  public availableNetworkAdapters: Record<string, any> = [];
  public bridgeNetworkAdapters: Record<string, any> = [];

  constructor(
    public $settings: SettingsService,
    private $api: ApiService,
    private $notification: NotificationService,
    public $toastr: ToastrService,
    private $modal: NgbModal,
    private $router: Router,
  ) {}

  ngOnInit() {
    this.initNetworkingOptions();
    if (this.$settings.env.serviceMode) {
      this.initServiceModeForm();
    }
  }

  initServiceModeForm() {
    this.$api.get('/platform-tools/hb-service/homebridge-startup-settings').subscribe(
      (data) => {
        this.serviceForm.patchValue(data);
        this.serviceForm.valueChanges.pipe(debounceTime(500)).subscribe(this.saveServiceModeSettings.bind(this));
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to load startup settings');
      },
    );
  }

  saveServiceModeSettings(data = this.serviceForm.value) {
    this.$api.put('/platform-tools/hb-service/homebridge-startup-settings', data).subscribe(() => {
      this.saved = true;
      this.$notification.configUpdated.next(undefined);
    });
  }

  resetHomebridgeState() {
    this.$modal.open(ResetHomebridgeModalComponent, {
      size: 'lg',
    });
  }

  unpairAccessory() {
    this.$modal.open(UnpairAccessoryModalComponent, {
      size: 'lg',
    });
  }

  removeAllCachedAccessories() {
    this.$modal.open(RemoveAllCachedAccessoriesModalComponent, {
      size: 'lg',
    });
  }

  removeSingleCachedAccessories() {
    this.$modal.open(RemoveSingleCachedAccessoryModalComponent, {
      size: 'lg',
    });
  }

  forceRestartService() {
    this.$api.put('/platform-tools/hb-service/set-full-service-restart-flag', {}).subscribe(
      () => {
        this.$router.navigate(['/restart']);
      },
      (err) => {
        this.$toastr.error(err.message, 'Failed to set force service restart flag.');
      },
    );
  }

  async initNetworkingOptions() {
    try {
      const homebridgePackage = await this.$api.get('/status/homebridge-version').toPromise();
      if (semver.gte(homebridgePackage.installedVersion, '1.3.0-beta.0')) {
        this.showNetworking = true;
        this.getNetworkSettings();
      }
      const onLinux = (
        this.$settings.env.runningInLinux ||
        this.$settings.env.runningInDocker ||
        this.$settings.env.runningInSynologyPackage ||
        this.$settings.env.runningInPackageMode
      );
      if (semver.gte(homebridgePackage.installedVersion, '1.4.0-beta.0')) {
        if (onLinux) {
          this.showAvahiMdnsOption = true;
        }
      }
      if (semver.gte(homebridgePackage.installedVersion, '1.6.0-beta.0')) {
        if (onLinux) {
          this.showResolvedMdnsOption = true;
        }
      }
    } catch (e) {

    }
  }

  async getNetworkSettings() {
    return Promise.all([
      this.$api.get('/server/network-interfaces/system').toPromise(),
      this.$api.get('/server/network-interfaces/bridge').toPromise(),
      this.$api.get('/server/mdns-advertiser').toPromise(),
    ]).then(([system, adapters, mdnsAdvertiser]) => {
      this.availableNetworkAdapters = system;
      this.buildBridgeNetworkAdapterList(adapters);
      this.legacyMdnsFormControl.patchValue(mdnsAdvertiser.advertiser);
      this.legacyMdnsFormControl.valueChanges.subscribe((advertiser: string) => {
        this.setHomebridgeMdnsSetting(advertiser);
      });
    });
  }

  async setHomebridgeMdnsSetting(advertiser: string) {
    this.$api.put('/server/mdns-advertiser', { advertiser })
      .subscribe(
        () => {
          this.saved = true;
          this.$notification.configUpdated.next(undefined);
        },
        (err) => {
          this.$toastr.error(err.message, 'Failed to set mdns advertiser.');
        },
      );
  }

  async setNetworkInterfaces(adapters: string[]) {
    this.$api.put('/server/network-interfaces/bridge', { adapters })
      .subscribe(
        () => {
          this.saved = true;
          this.$notification.configUpdated.next(undefined);
        },
        (err) => {
          this.$toastr.error(err.message, 'Failed to set network adapters.');
        },
      );
  }

  buildBridgeNetworkAdapterList(adapters: string[]) {
    if (!adapters.length) {
      this.bridgeNetworkAdapters = [];
      return;
    }

    this.bridgeNetworkAdapters = adapters.map((interfaceName) => {
      const i = this.availableNetworkAdapters.find((x => x.iface === interfaceName));
      if (i) {
        i.selected = true;
        i.missing = false;
        return i;
      } else {
        return {
          iface: interfaceName,
          missing: true,
        };
      }
    });
  }

  selectNetworkInterfaces() {
    const ref = this.$modal.open(SelectNetworkInterfacesComponent, {
      size: 'lg',
    });

    ref.componentInstance.availableNetworkAdapters = this.availableNetworkAdapters;
    ref.componentInstance.bridgeNetworkAdapters = this.bridgeNetworkAdapters;

    ref.result
      .then((adapters: string[]) => {
        this.buildBridgeNetworkAdapterList(adapters);
        this.setNetworkInterfaces(adapters);
      })
      .catch(() => {
        // do nothing
      });
  }
}
