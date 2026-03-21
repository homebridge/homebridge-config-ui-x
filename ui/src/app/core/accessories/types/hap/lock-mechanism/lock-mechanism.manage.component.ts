import type { ServiceTypeX, SliderControlConfig } from '@/app/core/accessories/accessories.interfaces'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, timer } from 'rxjs'
import { distinctUntilChanged, takeUntil } from 'rxjs/operators'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { DurationPipe } from '@/app/core/pipes/duration.pipe'

@Component({
  selector: 'app-lock-mechanism-manage',
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    DurationPipe,
  ],
  standalone: true,
  templateUrl: './lock-mechanism.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LockMechanismManageComponent extends BaseManageComponent {
  private cancelLockTimer$ = new Subject<void>()

  public serviceManagement!: ServiceTypeX
  public targetMode!: number
  public targetLockManagementAutoSecurityTimeout!: SliderControlConfig
  public targetLockManagementAutoSecurityTimeoutChanged: Subject<number> = new Subject<number>()

  protected setupComponent() {
    this.targetMode = this.service.values.LockTargetState

    if (this.service.linkedServices) {
      this.serviceManagement = Object.values(this.service.linkedServices).find(service => service.type === 'LockManagement') as ServiceTypeX
    }

    if (this.serviceManagement) {
      this.targetLockManagementAutoSecurityTimeoutChanged
        .pipe(
          distinctUntilChanged(),
        )
        .subscribe(() => {
          void this.serviceManagement.getCharacteristic!('LockManagementAutoSecurityTimeout').setValue!(this.targetLockManagementAutoSecurityTimeout.value)
        })

      this.createDebouncedSubscription(
        this.targetLockManagementAutoSecurityTimeoutChanged,
        () => {
          void this.serviceManagement.getCharacteristic!('LockManagementAutoSecurityTimeout').setValue!(this.targetLockManagementAutoSecurityTimeout.value)
        },
        300,
      )

      this.loadTargetLockManagementAutoSecurityTimeout()
    }
  }

  protected handleAccessoryUpdate() {
    this.targetMode = this.service.values.LockTargetState
    if (this.targetLockManagementAutoSecurityTimeout && this.serviceManagement) {
      this.targetLockManagementAutoSecurityTimeout.value = this.serviceManagement.getCharacteristic!('LockManagementAutoSecurityTimeout')?.value as number
    }
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    void this.service.getCharacteristic!('LockTargetState').setValue!(this.targetMode)

    // Cancel any existing lock timer
    this.cancelLockTimer$.next()

    // If the target mode is 0 (unlocked), and there is a targetLockManagementAutoSecurityTimeout.value, set a new timeout
    if (this.targetMode === 0 && this.targetLockManagementAutoSecurityTimeout?.value > 0) {
      timer((this.targetLockManagementAutoSecurityTimeout.value + 0.3) * 1000)
        .pipe(
          takeUntil(this.cancelLockTimer$),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.targetMode = 1
          this.cdr.markForCheck()
        })
    }

    this.blurTarget(event)
  }

  public onLockManagementAutoSecurityTimeoutStateChange() {
    this.targetLockManagementAutoSecurityTimeoutChanged.next(this.targetLockManagementAutoSecurityTimeout.value)
  }

  private loadTargetLockManagementAutoSecurityTimeout() {
    const TargetLockManagementAutoSecurityTimeout = this.serviceManagement.getCharacteristic!('LockManagementAutoSecurityTimeout')
    if (TargetLockManagementAutoSecurityTimeout) {
      this.targetLockManagementAutoSecurityTimeout = {
        value: (TargetLockManagementAutoSecurityTimeout.value as number) || 0,
        min: TargetLockManagementAutoSecurityTimeout.minValue || 0,
        max: TargetLockManagementAutoSecurityTimeout.maxValue || 3600,
        step: TargetLockManagementAutoSecurityTimeout.minStep || 10,
      }

      this.applySliderGradient('linear-gradient(to right, #ffffff, #ffd966, #ff0000)')
    }
  }
}
