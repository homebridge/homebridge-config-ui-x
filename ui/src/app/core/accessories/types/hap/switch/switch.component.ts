import { LowerCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-switch',
  imports: [
    LongClickDirective,
    LowerCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwitchComponent {
  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public isOn(): boolean {
    const values = this.service().values
    if (!values) {
      return false
    }

    if ('On' in values) {
      return !!values.On
    }
    if ('Active' in values) {
      return !!values.Active
    }
    if ('CurrentMediaState' in values) {
      return [0, 1].includes(values.CurrentMediaState)
    }
    if ('Mute' in values && 'Volume' in values) {
      return !values.Mute && values.Volume > 0
    }
    if ('Mute' in values) {
      return !values.Mute
    }
    if ('LockTargetState' in values) {
      return !values.LockTargetState
    }
    if ('CurrentDoorState' in values) {
      return [0, 2].includes(values.CurrentDoorState)
    }
    return false
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('On' in this.service().values) {
      void this.service().getCharacteristic!('On').setValue!(!this.service().values.On)
    } else if ('Active' in this.service().values) {
      void this.service().getCharacteristic!('Active').setValue!(this.service().values.Active ? 0 : 1)
    } else if ('TargetMediaState' in this.service().values) {
      void this.service().getCharacteristic!('TargetMediaState').setValue!(this.service().values.TargetMediaState === 0 ? 1 : 0)
    } else if ('Mute' in this.service().values) {
      void this.service().getCharacteristic!('Mute').setValue!(!this.service().values.Mute)
    } else if ('LockTargetState' in this.service().values) {
      void this.service().getCharacteristic!('LockTargetState').setValue!(this.service().values.LockTargetState ? 0 : 1)
    } else if ('TargetDoorState' in this.service().values) {
      void this.service().getCharacteristic!('TargetDoorState').setValue!(this.service().values.TargetDoorState ? 0 : 1)
    }
  }

  public hasCurrentConsumption(): boolean {
    return 'Consumption' in this.service().values
  }

  public currentConsumption(): number | undefined {
    if (!this.hasCurrentConsumption()) {
      return undefined
    }

    return this.service().values.Consumption
  }
}
