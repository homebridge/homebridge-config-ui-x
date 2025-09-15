import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/humidifier-dehumidifier/humidifier-dehumidifier.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-humidifier-dehumidifier',
  templateUrl: './humidifier-dehumidifier.component.html',
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
  @Input() public readyForControl = false
  @Input() public type: 'humidifier' | 'dehumidifier'

  public hasHumidifier: boolean = false
  public hasDehumidifier: boolean = false

  public ngOnInit() {
    this.hasHumidifier = 'RelativeHumidityHumidifierThreshold' in this.service.values
    this.hasDehumidifier = 'RelativeHumidityDehumidifierThreshold' in this.service.values
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
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('TargetHumidifierDehumidifierState' in this.service.values) {
      const ref = this.$modal.open(HumidifierDehumidifierManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
      ref.componentInstance.type = this.type
    }
  }
}
