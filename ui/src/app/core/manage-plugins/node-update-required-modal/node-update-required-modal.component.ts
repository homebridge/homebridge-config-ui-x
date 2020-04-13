import { Component, OnInit, Input } from '@angular/core';
import { NgbModal, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../auth/auth.service';
import { minVersion } from 'semver';

@Component({
  selector: 'app-node-update-required-modal',
  templateUrl: './node-update-required-modal.component.html',
  styleUrls: ['./node-update-required-modal.component.scss'],
})
export class NodeUpdateRequiredModalComponent implements OnInit {
  @Input() plugin;

  public minVersion;
  public installedVersion;

  constructor(
    public activeModal: NgbActiveModal,
    private $auth: AuthService,
  ) { }

  ngOnInit(): void {
    this.minVersion = minVersion(this.plugin.engines.node);
    this.installedVersion = this.$auth.env.nodeVersion;
  }

}
