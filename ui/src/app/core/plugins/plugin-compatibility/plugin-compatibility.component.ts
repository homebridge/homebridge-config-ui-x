import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core'
import { NgbAlert } from '@ng-bootstrap/ng-bootstrap/alert'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { minVersion, SemVer } from 'semver'

import { PLUGIN_COMPATIBILITY_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plugin-compatibility.component.html',
  standalone: true,
  imports: [TranslatePipe, NgbAlert],
})
export class PluginCompatibilityComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)
  private modalData = inject(PLUGIN_COMPATIBILITY_MODAL_DATA)

  // Public properties (from injected data)
  public plugin = this.modalData.plugin
  public isValidNode = this.modalData.isValidNode ?? false
  public isValidHb = this.modalData.isValidHb ?? false
  public action = this.modalData.action ?? null

  // Other properties
  public nodeMinVersion: SemVer
  public nodeInstalledVersion: string
  public hbMinVersion: SemVer
  public hbInstalledVersion: string

  public ngOnInit(): void {
    const plugin = this.plugin
    if (!plugin) {
      console.error('PluginCompatibilityComponent: plugin not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    this.nodeMinVersion = minVersion(plugin.updateEngines?.node)
    this.nodeInstalledVersion = this.$settings.env.nodeVersion
    this.hbMinVersion = minVersion(plugin.updateEngines?.homebridge)
    this.hbInstalledVersion = this.$settings.env.homebridgeVersion
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(): void {
    this.$activeModal.close(true)
  }
}
