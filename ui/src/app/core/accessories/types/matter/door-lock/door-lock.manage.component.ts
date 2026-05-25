import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { DoorLockState } from '@/app/core/accessories/types/matter/matter-device.constants'
import { getDoorLockState, setDoorLockState } from '@/app/core/accessories/types/matter/matter-device.utils'

@Component({
  selector: 'app-door-lock-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './door-lock.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DoorLockManageComponent extends BaseManageComponent {
  public targetMode!: number

  protected setupComponent() {
    this.targetMode = getDoorLockState(this.service)
  }

  protected handleAccessoryUpdate() {
    this.targetMode = getDoorLockState(this.service)
  }

  public async setTargetMode(value: number, event: MouseEvent) {
    const previousMode = this.targetMode

    try {
      this.targetMode = value
      this.cdr.markForCheck()

      const locked = value === DoorLockState.Locked
      await setDoorLockState(this.service, locked)

      this.blurTarget(event)
    } catch (error) {
      this.showGenericErrorToast(error)
      // Revert to previous state on error
      this.targetMode = previousMode
      this.cdr.markForCheck()
    }
  }
}
