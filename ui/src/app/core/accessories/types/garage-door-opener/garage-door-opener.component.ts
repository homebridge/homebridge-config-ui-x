import { NgClass } from '@angular/common'
import { Component, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-garage-door-opener',
  templateUrl: './garage-door-opener.component.html',
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class GarageDoorOpenerComponent {
  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    this.service.getCharacteristic('TargetDoorState').setValue(this.service.values.TargetDoorState ? 0 : 1)
  }
}
