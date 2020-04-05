import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { ServiceTypeX } from '../../accessories.interfaces';
import { SecuritysystemManageComponent } from './securitysystem.manage.component';

@Component({
  selector: 'app-securitysystem',
  templateUrl: './securitysystem.component.html',
  styleUrls: ['./securitysystem.component.scss'],
})
export class SecuritysystemComponent implements OnInit {
  @Input() public service: ServiceTypeX;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() {
  }

  onClick() {
    const ref = this.modalService.open(SecuritysystemManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

}
