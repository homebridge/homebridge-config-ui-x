import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'

@Component({
  templateUrl: './lock-mechanism.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    DurationPipe,
    NgClass,
  ],
})
export class LockMechanismManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private lockTimeout: any

  @Input() public service: ServiceTypeX

  public serviceManagement: any
  public targetMode: any
  public targetLockManagementAutoSecurityTimeout: any
  public targetLockManagementAutoSecurityTimeoutChanged: Subject<string> = new Subject<string>()

  public ngOnInit() {
    this.targetMode = this.service.values.LockTargetState

    if (this.service.linkedServices) {
      this.serviceManagement = Object.values(this.service.linkedServices).find(service => service.type === 'LockManagement')
    }

    if (this.serviceManagement) {
      this.targetLockManagementAutoSecurityTimeoutChanged
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
        )
        .subscribe(() => {
          this.serviceManagement.getCharacteristic('LockManagementAutoSecurityTimeout').setValue(this.targetLockManagementAutoSecurityTimeout.value)
        })

      this.loadTargetLockManagementAutoSecurityTimeout()
    }
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('LockTargetState').setValue(this.targetMode)

    // Clear the existing timeout if it exists
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout)
      this.lockTimeout = null
    }

    // If the target mode is 0 (unlocked), and there is a targetLockManagementAutoSecurityTimeout.value, set a new timeout
    if (this.targetMode === 0 && this.targetLockManagementAutoSecurityTimeout?.value > 0) {
      this.lockTimeout = setTimeout(() => {
        this.targetMode = 1
      }, (this.targetLockManagementAutoSecurityTimeout.value + 0.3) * 1000)
    }

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onLockManagementAutoSecurityTimeoutStateChange() {
    this.targetLockManagementAutoSecurityTimeoutChanged.next(this.targetLockManagementAutoSecurityTimeout.value)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadTargetLockManagementAutoSecurityTimeout() {
    const TargetLockManagementAutoSecurityTimeout = this.serviceManagement.getCharacteristic('LockManagementAutoSecurityTimeout')
    if (TargetLockManagementAutoSecurityTimeout) {
      this.targetLockManagementAutoSecurityTimeout = {
        value: TargetLockManagementAutoSecurityTimeout.value || 0,
        min: TargetLockManagementAutoSecurityTimeout.minValue || 0,
        max: TargetLockManagementAutoSecurityTimeout.maxValue || 3600,
        step: TargetLockManagementAutoSecurityTimeout.minStep || 10,
      }

      setTimeout(() => {
        const sliderElements = document.querySelectorAll('.noUi-target')
        sliderElements.forEach((sliderElement: HTMLElement) => {
          sliderElement.style.background = 'linear-gradient(to right, #ffffff, #ffd966, #ff0000)'
        })
      }, 10)
    }
  }
}
