import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';

import { ApiService } from '@/app/core/api.service';

@Component({
  selector: 'app-bridge-plugins-modal',
  templateUrl: './bridge-plugins-modal.component.html',
  styleUrls: ['./bridge-plugins-modal.component.scss'],
})
export class BridgePluginsModalComponent implements OnInit {
  @Input() plugin;
  @Input() schema;

  public saveInProgress = false;
  public configBlocks: any[] = [];
  public enabledBlocks: Record<number, boolean> = {};
  public usernameCache: Map<number, string> = new Map();
  public deviceInfo: Map<string, any> = new Map();

  constructor(
    public activeModal: NgbActiveModal,
    private $api: ApiService,
    private $toastr: ToastrService,
    private $translate: TranslateService,
  ) { }

  ngOnInit(): void {
    this.loadPluginConfig();
  }

  loadPluginConfig() {
    this.$api.get(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`).subscribe(
      (configBlocks) => {
        this.configBlocks = configBlocks;
        for (const [i, block] of this.configBlocks.entries()) {
          if (block._bridge && block._bridge.username) {
            this.enabledBlocks[i] = true;
            this.usernameCache.set(i, block._bridge.username);
            this.getDeviceInfo(block._bridge.username);
          }
        }
      },
      (err) => {
        this.$toastr.error('Failed to load config: ' + err.error?.message, this.$translate.instant('toast.title_error'));
      },
    );
  }

  toggleExternalBridge(block, enable: boolean, index: number) {
    if (!enable) {
      delete block._bridge;
      return;
    }

    block._bridge = {
      username: this.usernameCache.get(index) || this.generateUsername(),
    };

    this.usernameCache.set(index, block._bridge.username);
    this.getDeviceInfo(block._bridge.username);
  }

  async getDeviceInfo(username: string) {
    try {
      this.deviceInfo[username] = await this.$api.get(`/server/pairings/${username.replace(/:/g, '')}`).toPromise();
    } catch (e) {
      this.deviceInfo[username] = false;
    }
  }

  async save() {
    this.saveInProgress = true;

    try {
      await this.$api.post(`/config-editor/plugin/${encodeURIComponent(this.plugin.name)}`, this.configBlocks).toPromise();
      this.activeModal.close();
    } catch (err) {
      this.$toastr.error(
        this.$translate.instant('config.toast_failed_to_save_config') + ': ' + err.error?.message,
        this.$translate.instant('toast.title_error'),
      );
    } finally {
      this.saveInProgress = false;
    }
  }

  /**
   * Generates a new random username
   */
  public generateUsername() {
    const hexDigits = '0123456789ABCDEF';
    let username = '0E:';
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      username += hexDigits.charAt(Math.round(Math.random() * 15));
      if (i !== 4) {
        username += ':';
      }
    }
    return username;
  }

}
