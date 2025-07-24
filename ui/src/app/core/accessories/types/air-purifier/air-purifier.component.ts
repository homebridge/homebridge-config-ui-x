import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AirPurifierManageComponent } from '@/app/core/accessories/types/air-purifier/air-purifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-air-purifier',
  templateUrl: './air-purifier.component.html',
  styleUrls: ['./air-purifier.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class AirPurifierComponent implements OnInit {
  private $modal = inject(NgbModal)
  private hasTargetValidValues = false

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public ngOnInit() {
    if ('TargetAirPurifierState' in this.service.values) {
      this.hasTargetValidValues = this.service.getCharacteristic('TargetAirPurifierState').validValues.length > 0
    }
  }

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
    } else if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    }

    // Set the rotation speed to max if on 0% when turned on
    if ('RotationSpeed' in this.service.values && !this.service.values.On && !this.service.values.Active && !this.service.values.RotationSpeed) {
      this.service.values.RotationSpeed = this.service.getCharacteristic('RotationSpeed').maxValue
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if (this.hasTargetValidValues || 'RotationSpeed' in this.service.values) {
      const ref = this.$modal.open(AirPurifierManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
    }
  }
}
