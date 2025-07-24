import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGDirective } from 'ng-inline-svg-2'
import { interval, Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ValveManageComponent } from '@/app/core/accessories/types/valve/valve.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-valve',
  templateUrl: './valve.component.html',
  styleUrls: ['./valve.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGDirective,
    TranslatePipe,
  ],
})
export class ValveComponent implements OnInit, OnDestroy {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public secondsActive = 0
  public remainingDuration: string
  private remainingDurationInterval = interval(1000).pipe(filter(() => this.isActive()))
  private remainingDurationSubscription: Subscription

  public ngOnInit() {
    // Set up the RemainingDuration countdown handlers, if the valve has the RemainingDuration Characteristic
    if ('SetDuration' in this.service.values) {
      this.setupRemainingDurationCounter()
    }
  }

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
    } else if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    if ('SetDuration' in this.service.values) {
      const ref = this.$modal.open(ValveManageComponent, {
        size: 'md',
        backdrop: 'static',
      })
      ref.componentInstance.service = this.service
    }
  }

  public ngOnDestroy() {
    if (this.remainingDurationSubscription) {
      this.remainingDurationSubscription.unsubscribe()
    }
  }

  private isActive() {
    if (this.service.values.Active) {
      return true
    } else {
      this.resetRemainingDuration()
      return false
    }
  }

  private setupRemainingDurationCounter() {
    this.remainingDurationSubscription = this.remainingDurationInterval.subscribe(() => {
      this.secondsActive++
      const remainingSeconds = this.service.getCharacteristic('RemainingDuration').value as number - this.secondsActive
      if (remainingSeconds > 0) {
        this.remainingDuration = remainingSeconds < 3600
          ? new Date(remainingSeconds * 1000).toISOString().substring(14, 19)
          : new Date(remainingSeconds * 1000).toISOString().substring(11, 19)
      } else {
        this.remainingDuration = ''
      }
    })
  }

  private resetRemainingDuration() {
    this.secondsActive = 0
    if (this.service.getCharacteristic('RemainingDuration')) {
      this.remainingDuration = ''
    }
  }
}
