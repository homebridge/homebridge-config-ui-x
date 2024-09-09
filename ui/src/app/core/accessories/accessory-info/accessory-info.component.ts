import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './accessory-info.component.html',
})
export class AccessoryInfoComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public accessoryInformation: Array<any>

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit() {
    this.accessoryInformation = Object.entries(this.service.accessoryInformation).map(([key, value]) => ({ key, value }))
  }
}
