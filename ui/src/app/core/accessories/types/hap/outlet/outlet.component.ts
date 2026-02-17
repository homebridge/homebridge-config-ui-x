import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-outlet',
  templateUrl: './outlet.component.html',
  styleUrl: './outlet.component.scss',
  standalone: true,
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
})
export class OutletComponent {
  private $settings = inject(SettingsService)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public browserLang = this.$settings.browserLang

  public isOn(): boolean {
    const values = this.service().values
    return !!(values?.On
      || values?.Active
      || ('LockTargetState' in values && !values?.LockTargetState)
      || ('CurrentDoorState' in values && [0, 2].includes(values?.CurrentDoorState)))
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('On' in this.service().values) {
      void this.service().getCharacteristic('On').setValue(!this.service().values.On)
    } else if ('Active' in this.service().values) {
      void this.service().getCharacteristic('Active').setValue(this.service().values.Active ? 0 : 1)
    } else if ('LockTargetState' in this.service().values) {
      void this.service().getCharacteristic('LockTargetState').setValue(this.service().values.LockTargetState ? 0 : 1)
    } else if ('TargetDoorState' in this.service().values) {
      void this.service().getCharacteristic('TargetDoorState').setValue(this.service().values.TargetDoorState ? 0 : 1)
    }
  }
}
