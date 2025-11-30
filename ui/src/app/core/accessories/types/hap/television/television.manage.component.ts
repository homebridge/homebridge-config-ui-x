import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'

@Component({
  templateUrl: './television.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TelevisionManageComponent extends BaseManageComponent {
  public inputList = input.required<Record<number, string>>()

  public hasActive: boolean = false
  public sourceList: { identifier: number, name: string }[] = []

  protected setupComponent() {
    if ('Active' in this.service.values) {
      this.hasActive = true
    }

    if (Object.keys(this.inputList).length) {
      Object.entries(this.inputList).forEach(([identifier, name]) => {
        this.sourceList.push({
          identifier: Number.parseInt(identifier, 10),
          name,
        })
      })
    }
  }

  protected handleAccessoryUpdate() {
    if ('Active' in this.service.values) {
      this.hasActive = true
    }
  }

  public setActive(value: number, event: MouseEvent) {
    void this.service.getCharacteristic('Active').setValue(value)

    this.blurTarget(event)
  }

  public setInput(value: number | string, event: MouseEvent) {
    void this.service.getCharacteristic('ActiveIdentifier').setValue(value)

    this.blurTarget(event)
  }
}
