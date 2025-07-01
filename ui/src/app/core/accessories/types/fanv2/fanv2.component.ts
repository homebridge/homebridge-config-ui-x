import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Fanv2ManageComponent } from '@/app/core/accessories/types/fanv2/fanv2.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-fanv2',
  templateUrl: './fanv2.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class Fanv2Component implements OnInit {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  public rotationSpeedUnit = ''
  public hasRotationDirection = false

  constructor() {}

  ngOnInit() {
    // Find the unit for the rotation speed
    const RotationSpeed = this.service.serviceCharacteristics.find(c => c.type === 'RotationSpeed')
    if (RotationSpeed && RotationSpeed.unit === 'percentage') {
      this.rotationSpeedUnit = '%'
    }
    if (this.service.serviceCharacteristics.find(c => c.type === 'RotationDirection')) {
      this.hasRotationDirection = true
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)

    // Set the rotation speed to max if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      const RotationSpeed = this.service.getCharacteristic('RotationSpeed')
      RotationSpeed.setValue(RotationSpeed.maxValue)
    }
  }

  onLongClick() {
    const ref = this.$modal.open(Fanv2ManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
