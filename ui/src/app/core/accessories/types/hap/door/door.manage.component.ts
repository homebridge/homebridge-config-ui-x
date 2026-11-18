import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { asNumber } from '@/app/core/accessories/types/hap/hap-values'

@Component({
  selector: 'app-door-manage',
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './door.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorManageComponent extends BaseManageComponent {
  public targetMode!: boolean
  public targetPositionChanged: Subject<string> = new Subject<string>()
  public targetPosition!: {
    value: any
    min: number
    max: number
    step: number
  }

  protected setupComponent() {
    this.createDebouncedSubscription(this.targetPositionChanged, () => {
      const currentPosition = asNumber(this.service.getCharacteristic?.('CurrentPosition')?.value)
      if (currentPosition !== undefined && currentPosition < this.targetPosition.value) {
        this.service.values.PositionState = 1
      } else if (currentPosition !== undefined && currentPosition > this.targetPosition.value) {
        this.service.values.PositionState = 0
      }
      void this.service.getCharacteristic?.('TargetPosition')?.setValue?.(this.targetPosition.value)
    })

    this.targetMode = !!this.service.values.On
    this.loadTargetPosition()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = !!this.service.values.On
    if (this.targetPosition) {
      this.targetPosition.value = this.service.getCharacteristic?.('TargetPosition')?.value
    }
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }

  private loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic?.('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue as number,
        max: TargetPosition.maxValue as number,
        step: TargetPosition.minStep as number,
      }

      this.applySliderGradient('linear-gradient(to right, #242424, #ffd6aa)')
    }
  }
}
