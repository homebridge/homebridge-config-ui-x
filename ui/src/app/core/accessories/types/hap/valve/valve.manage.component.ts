import type { SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'

@Component({
  templateUrl: './valve.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    DurationPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValveManageComponent extends BaseManageComponent {
  public targetMode: boolean
  public targetSetDuration: SliderControlConfig
  public targetSetDurationChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetSetDurationChanged, () => {
      void this.service.getCharacteristic('SetDuration').setValue(this.targetSetDuration.value)
    })

    this.targetMode = this.service.values.Active

    this.loadTargetSetDuration()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.Active
    if (this.targetSetDuration && 'SetDuration' in this.service.values) {
      this.targetSetDuration.value = this.service.getCharacteristic('SetDuration').value as number
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('Active').setValue(this.targetMode)

    this.blurTarget(event)
  }

  public onSetDurationStateChange() {
    this.targetSetDurationChanged.next(this.targetSetDuration.value)
  }

  private loadTargetSetDuration() {
    const TargetSetDuration = this.service.getCharacteristic('SetDuration')

    if (TargetSetDuration) {
      this.targetSetDuration = {
        value: TargetSetDuration.value as number,
        min: TargetSetDuration.minValue,
        max: TargetSetDuration.maxValue,
        step: TargetSetDuration.minStep,
      }

      this.applySliderGradient('linear-gradient(to right, #add8e6, #416bdf)', '.noUi-target')
    }
  }
}
