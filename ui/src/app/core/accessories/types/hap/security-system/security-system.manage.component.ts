import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  imports: [FormsModule, TranslatePipe],
  standalone: true,
  templateUrl: './security-system.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecuritySystemManageComponent extends BaseManageComponent {
  public targetMode: number
  public targetModeValidValues: number[] = []

  protected setupComponent() {
    this.targetMode = this.service.values.SecuritySystemTargetState
    this.targetModeValidValues = this.service.getCharacteristic('SecuritySystemTargetState').validValues as number[]
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.SecuritySystemTargetState
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic('SecuritySystemTargetState').setValue(this.targetMode)

    this.blurTarget(event)
  }
}
