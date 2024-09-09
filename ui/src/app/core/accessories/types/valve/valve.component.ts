import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ValveManageComponent } from '@/app/core/accessories/types/valve/valve.manage.component'
import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { interval, Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'

@Component({
  selector: 'app-valve',
  templateUrl: './valve.component.html',
  styleUrls: ['./valve.component.scss'],
})
export class ValveComponent implements OnInit, OnDestroy {
  @Input() public service: ServiceTypeX

  public secondsActive = 0
  public remainingDuration: string
  private remainingDurationInterval = interval(1000).pipe(filter(() => this.isActive()))
  private remainingDurationSubscription: Subscription

  constructor(
    private modalService: NgbModal,
  ) {}

  ngOnInit() {
    // set up the RemainingDuration countdown handlers, if the valve has the RemainingDuration Characteristic
    if (this.service.getCharacteristic('RemainingDuration')) {
      this.setupRemainingDurationCounter()
    }
  }

  isActive() {
    if (this.service && this.service.values) {
      if (this.service.getCharacteristic('Active').value === 1) {
        return true
      } else {
        this.resetRemainingDuration()
        return false
      }
    } else {
      return false
    }
  }

  setupRemainingDurationCounter() {
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

  resetRemainingDuration() {
    this.secondsActive = 0
    if (this.service.getCharacteristic('RemainingDuration')) {
      this.remainingDuration = ''
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    if (!this.service.getCharacteristic('SetDuration')) {
      return
    }

    const ref = this.modalService.open(ValveManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }

  ngOnDestroy() {
    if (this.remainingDurationSubscription) {
      this.remainingDurationSubscription.unsubscribe()
    }
  }
}
