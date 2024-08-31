import { Component, Input, OnInit } from '@angular/core';
import {  NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { SemVer, minVersion } from 'semver';
import { SettingsService } from '@/app/core/settings.service';

@Component({
  templateUrl: './node-update-required.component.html',
})
export class NodeUpdateRequiredComponent implements OnInit {
  @Input() plugin: any;

  public minVersion: SemVer;
  public installedVersion: string;

  constructor(
    public activeModal: NgbActiveModal,
    private $settings: SettingsService,
  ) {}

  ngOnInit(): void {
    this.minVersion = minVersion(this.plugin.engines.node);
    this.installedVersion = this.$settings.env.nodeVersion;
  }
}
