import { Component, computed, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  selector: 'app-on-off-plug-in-unit',
  templateUrl: './on-off-plug-in-unit.component.html',
  styleUrl: './on-off-plug-in-unit.component.scss',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class OnOffPlugInUnitComponent {
  private $settings = inject(SettingsService)

  public service = input.required<ServiceTypeX>()
  public readyForControl = input<boolean>(false)

  public browserLang = this.$settings.browserLang

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    controlDevice(this.service())
  }

  public isOn = computed(() => getDeviceActiveState(this.service()))
}
