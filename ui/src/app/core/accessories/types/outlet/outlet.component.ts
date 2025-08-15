import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-outlet',
  templateUrl: './outlet.component.html',
  styleUrls: ['./outlet.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class OutletComponent {
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public browserLang = this.$settings.browserLang

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    } else if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
    } else if ('LockTargetState' in this.service.values) {
      this.service.getCharacteristic('LockTargetState').setValue(this.service.values.LockTargetState ? 0 : 1)
    } else if ('TargetDoorState' in this.service.values) {
      this.service.getCharacteristic('TargetDoorState').setValue(this.service.values.TargetDoorState ? 0 : 1)
    }
  }
}
