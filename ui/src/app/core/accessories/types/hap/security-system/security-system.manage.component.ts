import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  selector: 'app-security-system-manage',
  imports: [FormsModule, TranslatePipe],
  standalone: true,
  templateUrl: './security-system.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecuritySystemManageComponent extends BaseManageComponent {
  public targetMode!: number
  public targetModeValidValues: number[] = []
  public isArming = false
  public isDisarming = false

  protected setupComponent() {
    this.targetMode = this.service.values.SecuritySystemTargetState
    this.targetModeValidValues = this.service.getCharacteristic!('SecuritySystemTargetState')!.validValues as number[]
    this.updateTransitionState()
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.SecuritySystemTargetState
    this.updateTransitionState()
  }

  private updateTransitionState() {
    const current = this.service.values.SecuritySystemCurrentState
    const target = this.service.values.SecuritySystemTargetState
    this.isArming = current !== target && target !== 3 && current !== 4
    this.isDisarming = current !== target && target === 3 && current !== 4
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic!('SecuritySystemTargetState')!.setValue!(this.targetMode)

    this.blurTarget(event)
  }
}
