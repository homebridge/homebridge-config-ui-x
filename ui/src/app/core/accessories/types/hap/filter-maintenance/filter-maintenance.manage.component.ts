import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'

@Component({
  templateUrl: './filter-maintenance.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
})
export class FilterMaintenanceManageComponent implements OnInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  @Input() public $accessories: AccessoriesService

  private stateSubscription: Subscription

  public targetMode: number

  public ngOnInit() {
    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      sliderElements.forEach((sliderElement: HTMLElement) => {
        sliderElement.style.background = 'linear-gradient(to right, #d32f2f, #e69533, #42d672, #42d672)'
      })
    }, 10)

    // Subscribe to real-time accessory updates
    if (this.$accessories) {
      this.stateSubscription = this.$accessories.accessoryData.subscribe(() => {
        // No manual updates needed: service.values.FilterLifeLevel is bound directly in template
      })
    }
  }

  public ngOnDestroy() {
    if (this.stateSubscription) {
      this.stateSubscription.unsubscribe()
    }
  }

  public resetFilterLife(event: MouseEvent) {
    this.service.getCharacteristic('ResetFilterIndication').setValue(1)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
