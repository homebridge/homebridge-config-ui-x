import { ChangeDetectionStrategy, Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { numberValue, stringValue } from '@/app/core/accessories/types/hap/hap-values'

@Component({
  selector: 'app-television-manage',
  imports: [
    FormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './television.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelevisionManageComponent extends BaseManageComponent {
  public hasActive: boolean = false
  public sourceList: { identifier: number, name: string }[] = []

  protected setupComponent() {
    if ('Active' in this.service.values) {
      this.hasActive = true
    }

    if (this.service.linkedServices) {
      for (const [, inputService] of Object.entries(this.service.linkedServices)) {
        const identifier = numberValue(inputService.values, 'Identifier')
        if (inputService.type === 'InputSource' && identifier !== undefined) {
          this.sourceList.push({
            identifier,
            name: stringValue(inputService.values, 'ConfiguredName') || `Input ${identifier}`,
          })
        }
      }
    }
  }

  protected handleAccessoryUpdate() {
    if ('Active' in this.service.values) {
      this.hasActive = true
    }
  }

  public setActive(value: number, event: MouseEvent) {
    void this.service.getCharacteristic?.('Active')?.setValue?.(value)

    this.blurTarget(event)
  }

  public setInput(value: number | string, event: MouseEvent) {
    void this.service.getCharacteristic?.('ActiveIdentifier')?.setValue?.(value)

    this.blurTarget(event)
  }
}
