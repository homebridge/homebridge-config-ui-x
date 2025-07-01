import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/humidifierdehumidifier/humidifierdehumidifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/longclick.directive'

@Component({
  selector: 'app-humidifierdehumidifier',
  templateUrl: './humidifierdehumidifier.component.html',
  styleUrls: ['./humidifierdehumidifier.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class HumidifierDehumidifierComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  model = 1
  public hasHumidifier: boolean = false
  public hasDehumidifier: boolean = false

  constructor() {}

  ngOnInit() {
    this.hasHumidifier = !!this.service.getCharacteristic('RelativeHumidityHumidifierThreshold')
    this.hasDehumidifier = !!this.service.getCharacteristic('RelativeHumidityDehumidifierThreshold')
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    const ref = this.$modal.open(HumidifierDehumidifierManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }
}
