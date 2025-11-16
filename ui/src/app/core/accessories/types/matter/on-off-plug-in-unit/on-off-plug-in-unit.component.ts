import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  selector: 'app-on-off-plug-in-unit',
  templateUrl: './on-off-plug-in-unit.component.html',
  styleUrls: ['./on-off-plug-in-unit.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class OnOffPlugInUnitComponent {
  private $settings = inject(SettingsService)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public browserLang = this.$settings.browserLang

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    controlDevice(this.service)
  }

  public get isOn(): boolean {
    return getDeviceActiveState(this.service)
  }
}
