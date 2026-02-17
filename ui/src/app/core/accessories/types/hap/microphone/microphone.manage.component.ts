import type { SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-microphone-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './microphone.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MicrophoneManageComponent extends BaseManageComponent {
  public targetMode: boolean
  public targetVolume: SliderControlConfig
  public targetVolumeChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetVolumeChanged, () => {
      void this.service.getCharacteristic('Volume').setValue(this.targetVolume.value)
    })

    this.targetMode = this.service.values.Mute
    this.loadTargetVolume()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.Mute
    if (this.targetVolume) {
      this.targetVolume.value = this.service.getCharacteristic('Volume')?.value as number
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('Mute').setValue(this.targetMode)

    this.blurTarget(event)
  }

  public setActive(value: number, event: MouseEvent) {
    void this.service.getCharacteristic('Active').setValue(value)

    this.blurTarget(event)
  }

  public setTargetState(value: number, event: MouseEvent) {
    void this.service.getCharacteristic('TargetMediaState').setValue(value)

    this.blurTarget(event)
  }

  public onVolumeStateChange() {
    this.targetVolumeChanged.next(this.targetVolume.value)
  }

  private loadTargetVolume() {
    const TargetVolume = this.service.getCharacteristic('Volume')
    if (TargetVolume) {
      this.targetVolume = {
        value: TargetVolume.value as number,
        min: TargetVolume.minValue,
        max: TargetVolume.maxValue,
        step: TargetVolume.minStep,
      }
      this.applySliderGradient('linear-gradient(to right, #ffffff, #ffd966, #ff0000)')
    }
  }
}
