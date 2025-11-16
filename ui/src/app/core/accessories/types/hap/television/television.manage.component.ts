import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './television.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    NgClass,
  ],
})
export class TelevisionManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public inputList: Record<number, string>
  @Input() public $accessories: AccessoriesService

  public hasActive: boolean = false
  public sourceList: { identifier: number, name: string }[] = []
  private stateSubscription: Subscription

  public ngOnInit() {
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

    // Subscribe to state changes to update modal in real-time
    this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
      if ('Active' in this.service.values) {
        this.hasActive = true
      }
    })
  }

  public setActive(value: number, event: MouseEvent) {
    this.service.getCharacteristic('Active').setValue(value)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setInput(value: number | string, event: MouseEvent) {
    this.service.getCharacteristic('ActiveIdentifier').setValue(value)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }
}
