import { SettingsService } from '@/app/core/settings.service'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { minVersion, SemVer } from 'semver'

@Component({
  templateUrl: './plugin-compatibility.component.html',
})
export class PluginCompatibilityComponent implements OnInit {
  @Input() plugin: any
  @Input() isValidNode: boolean
  @Input() isValidHb: boolean
  @Input() action: string // 'install' | 'update' | 'alternate'

  public nodeMinVersion: SemVer
  public nodeInstalledVersion: string
  public hbMinVersion: SemVer
  public hbInstalledVersion: string

  constructor(
    public activeModal: NgbActiveModal,
    private $settings: SettingsService,
  ) {}

  ngOnInit(): void {
    this.nodeMinVersion = minVersion(this.plugin.updateEngines?.node)
    this.nodeInstalledVersion = this.$settings.env.nodeVersion
    this.hbMinVersion = minVersion(this.plugin.updateEngines?.homebridge)
    this.hbInstalledVersion = this.$settings.env.homebridgeVersion
  }
}
