import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { FanManageComponent } from '@/app/core/accessories/types/fan/fan.manage.component'
import { Component, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-fan',
  templateUrl: './fan.component.html',
  styleUrls: ['./fan.component.scss'],
})
export class FanComponent implements OnInit {
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
    this.service.getCharacteristic('On').setValue(!this.service.values.On)

    // set the rotation speed to max if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      const RotationSpeed = this.service.getCharacteristic('RotationSpeed')
      RotationSpeed.setValue(RotationSpeed.maxValue)
    }
  }

  onLongClick() {
    const ref = this.modalService.open(FanManageComponent, {
      size: 'md',
    })
    ref.componentInstance.service = this.service
  }
}
