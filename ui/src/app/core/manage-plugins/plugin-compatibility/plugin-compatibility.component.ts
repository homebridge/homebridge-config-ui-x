import { SettingsService } from '@/app/core/settings.service'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { minVersion, SemVer } from 'semver'

@Component({
  templateUrl: './plugin-compatibility.component.html',
  imports: [TranslatePipe],
})
export class PluginCompatibilityComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $settings = inject(SettingsService)

  @Input() plugin: any
  @Input() isValidNode: boolean
  @Input() isValidHb: boolean
  @Input() action: string // 'install' | 'update' | 'alternate'

  public nodeMinVersion: SemVer
  public nodeInstalledVersion: string
  public hbMinVersion: SemVer
  public hbInstalledVersion: string

  ngOnInit(): void {
    this.nodeMinVersion = minVersion(this.plugin.updateEngines?.node)
    this.nodeInstalledVersion = this.$settings.env.nodeVersion
    this.hbMinVersion = minVersion(this.plugin.updateEngines?.homebridge)
    this.hbInstalledVersion = this.$settings.env.homebridgeVersion
  }
}
