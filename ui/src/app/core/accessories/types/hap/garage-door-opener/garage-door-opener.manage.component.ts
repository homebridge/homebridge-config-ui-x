import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-garage-door-opener-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './garage-door-opener.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GarageDoorOpenerManageComponent extends BaseManageComponent {
  public targetState!: number
  private lastMovingDirection: number | undefined

  protected setupComponent() {
    this.targetState = this.resolveTargetState(this.service.values.CurrentDoorState)
  }

  protected handleAccessoryUpdate() {
    this.targetState = this.resolveTargetState(this.service.values.CurrentDoorState)
  }

  /**
   * When stopped, resolve to the reverse direction target:
   * Was Closing (3) -> target Open (0), Was Opening (2) -> target Close (1)
   */
  private resolveTargetState(currentState: number): number {
    if (currentState === 2 || currentState === 3) {
      this.lastMovingDirection = currentState
    }
    if (currentState === 4 && this.lastMovingDirection !== undefined) {
      return this.lastMovingDirection === 3 ? 0 : 1
    }
    return currentState
  }

  public setTargetState(value: number, event: MouseEvent) {
    void this.service.getCharacteristic!('TargetDoorState')!.setValue!(value)

    this.blurTarget(event)
  }
}
