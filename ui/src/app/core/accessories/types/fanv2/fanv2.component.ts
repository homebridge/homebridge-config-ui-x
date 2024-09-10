import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Fanv2ManageComponent } from '@/app/core/accessories/types/fanv2/fanv2.manage.component'
import { Component, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-fanv2',
  templateUrl: './fanv2.component.html',
  styleUrls: ['./fanv2.component.scss'],
})
export class Fanv2Component implements OnInit {
  @Input() public service: ServiceTypeX
  public rotationSpeedUnit = ''

  constructor(
    private modalService: NgbModal,
  ) {}

  ngOnInit() {
    // Find the unit for the rotation speed
    const RotationSpeed = this.service.serviceCharacteristics.find(c => c.type === 'RotationSpeed')
    if (RotationSpeed && RotationSpeed.unit === 'percentage') {
      this.rotationSpeedUnit = '%'
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)

    // set the rotation speed to max if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      const RotationSpeed = this.service.getCharacteristic('RotationSpeed')
      RotationSpeed.setValue(RotationSpeed.maxValue)
    }
  }

  onLongClick() {
    const ref = this.modalService.open(Fanv2ManageComponent, {
      size: 'md',
    })
    ref.componentInstance.service = this.service
  }
}
