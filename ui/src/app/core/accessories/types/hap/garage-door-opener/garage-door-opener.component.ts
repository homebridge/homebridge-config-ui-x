import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-garage-door-opener',
  templateUrl: './garage-door-opener.component.html',
  styleUrl: './garage-door-opener.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class GarageDoorOpenerComponent {
  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('TargetDoorState' in this.service().values) {
      void this.service().getCharacteristic('TargetDoorState').setValue(this.service().values.TargetDoorState ? 0 : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic('On').setValue(!this.service().values.On)
    } else if ('Active' in this.service().values) {
      void this.service().getCharacteristic('Active').setValue(!this.service().values.Active)
    }
  }
}
