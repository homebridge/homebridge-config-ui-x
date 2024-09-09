import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AirpurifierManageComponent } from '@/app/core/accessories/types/airpurifier/airpurifier.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-airpurifier',
  templateUrl: './airpurifier.component.html',
  styleUrls: ['./airpurifier.component.scss'],
})
export class AirpurifierComponent {
  @Input() public service: ServiceTypeX

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)

    // set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      this.service.getCharacteristic('RotationSpeed').setValue(100)
    }
  }

  onLongClick() {
    const ref = this.modalService.open(AirpurifierManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
