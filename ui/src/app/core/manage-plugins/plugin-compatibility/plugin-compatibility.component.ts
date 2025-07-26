import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { minVersion, SemVer } from 'semver'

import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './plugin-compatibility.component.html',
  standalone: true,
  imports: [TranslatePipe, NgbAlert],
})
export class PluginCompatibilityComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)

  @Input() plugin: Plugin
  @Input() isValidNode: boolean
  @Input() isValidHb: boolean
  @Input() action: 'install' | 'update' | 'alternate'

  public nodeMinVersion: SemVer
  public nodeInstalledVersion: string
  public hbMinVersion: SemVer
  public hbInstalledVersion: string

  public ngOnInit(): void {
    this.nodeMinVersion = minVersion(this.plugin.updateEngines?.node)
    this.nodeInstalledVersion = this.$settings.env.nodeVersion
    this.hbMinVersion = minVersion(this.plugin.updateEngines?.homebridge)
    this.hbInstalledVersion = this.$settings.env.homebridgeVersion
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    this.$activeModal.close(true)
  }
}
