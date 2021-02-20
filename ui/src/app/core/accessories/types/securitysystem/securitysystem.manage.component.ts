import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

@Component({
  selector: 'app-securitysystem.manage',
  templateUrl: './securitysystem.manage.component.html',
  styleUrls: ['./securitysystem.component.scss'],
})
export class SecuritysystemManageComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  public targetMode: any;

  constructor(
    public activeModal: NgbActiveModal,
  ) { }

  ngOnInit() {
    this.targetMode = this.service.values.SecuritySystemTargetState;
  }

  onTargetStateChange() {
    this.service.getCharacteristic('SecuritySystemTargetState').setValue(this.targetMode);
  }

}
