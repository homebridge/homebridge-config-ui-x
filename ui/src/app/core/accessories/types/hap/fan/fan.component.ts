import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { FanManageComponent } from '@/app/core/accessories/types/hap/fan/fan.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-fan',
  templateUrl: './fan.component.html',
  styleUrls: ['./fan.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class FanComponent implements OnInit {
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public rotationSpeedUnit = ''
  public hasRotationDirection = false

  public ngOnInit() {
    // Find the unit for the rotation speed
    if ('RotationSpeed' in this.service.values) {
      const RotationSpeed = this.service.serviceCharacteristics.find(c => c.type === 'RotationSpeed')
      if (RotationSpeed.unit === 'percentage') {
        this.rotationSpeedUnit = '%'
      }
    }
    if ('RotationDirection' in this.service.values) {
      this.hasRotationDirection = true
    }
  }

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    } else if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
    }

    // Set the rotation speed to max if on 0% when turned on
    if ('RotationSpeed' in this.service.values && !this.service.values.On && !this.service.values.RotationSpeed) {
      this.service.values.RotationSpeed = this.service.getCharacteristic('RotationSpeed').maxValue
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('RotationSpeed' in this.service.values || 'RotationDirection' in this.service.values) {
      const ref = this.$modal.open(FanManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
      ref.componentInstance.$accessories = this.$accessories
    }
  }
}
