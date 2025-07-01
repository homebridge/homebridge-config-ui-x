import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AirpurifierManageComponent } from '@/app/core/accessories/types/airpurifier/airpurifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-airpurifier',
  templateUrl: './airpurifier.component.html',
  styleUrls: ['./airpurifier.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class AirpurifierComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  constructor() {}

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)

    // Set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'RotationSpeed' in this.service.values && !this.service.values.RotationSpeed) {
      this.service.getCharacteristic('RotationSpeed').setValue(100)
    }
  }

  onLongClick() {
    const ref = this.$modal.open(AirpurifierManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
