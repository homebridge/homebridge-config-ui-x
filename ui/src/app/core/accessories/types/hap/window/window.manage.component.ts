import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-window-manage',
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './window.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WindowManageComponent extends BaseManageComponent {
  public targetMode: string
  public targetPositionChanged: Subject<string> = new Subject<string>()
  public targetPosition: {
    value: any
    min: number
    max: number
    step: number
  }

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetPositionChanged, () => {
      if (this.service.getCharacteristic('CurrentPosition').value < this.targetPosition.value) {
        this.service.values.PositionState = 1
      } else if (this.service.getCharacteristic('CurrentPosition').value > this.targetPosition.value) {
        this.service.values.PositionState = 0
      }
      void this.service.getCharacteristic('TargetPosition').setValue(this.targetPosition.value)
    })

    this.targetMode = this.service.values.On
    this.loadTargetPosition()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.On
    if (this.targetPosition && 'TargetPosition' in this.service.values) {
      this.targetPosition.value = this.service.getCharacteristic('TargetPosition').value
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  private loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue,
        max: TargetPosition.maxValue,
        step: TargetPosition.minStep,
      }

      this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
    }
  }
}
