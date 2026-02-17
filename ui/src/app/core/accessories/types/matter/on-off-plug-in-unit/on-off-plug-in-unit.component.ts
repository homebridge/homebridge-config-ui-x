import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { controlDevice, getDeviceActiveState } from '@/app/core/accessories/types/matter/matter-device.utils'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public browserLang = this.$settings.browserLang

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    controlDevice(this.service())
  }

  public readonly isOn = computed(() => getDeviceActiveState(this.service()))
}
