import { Component, OnInit, Input } from '@angular/core';
import {  NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { minVersion, SemVer } from 'semver';

import { SettingsService } from '@/app/core/settings.service';

@Component({
  selector: 'app-node-update-required-modal',
  templateUrl: './node-update-required-modal.component.html',
  styleUrls: ['./node-update-required-modal.component.scss'],
})
export class NodeUpdateRequiredModalComponent implements OnInit {
  @Input() plugin: any;

  public minVersion: SemVer;
  public installedVersion: string;

  constructor(
    public activeModal: NgbActiveModal,
    private $settings: SettingsService,
  ) { }

  ngOnInit(): void {
    this.minVersion = minVersion(this.plugin.engines.node);
    this.installedVersion = this.$settings.env.nodeVersion;
  }
}
