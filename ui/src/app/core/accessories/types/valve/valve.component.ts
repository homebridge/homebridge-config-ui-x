import { Component, OnInit, Input, OnDestroy, OnChanges } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { ValveManageComponent } from './valve.manage.component';
import { interval, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-valve',
  templateUrl: './valve.component.html',
  styleUrls: ['./valve.component.scss'],
})
export class ValveComponent implements OnInit, OnDestroy {
  @Input() public service: ServiceTypeX;

  public secondsActive = 0;
  public remainingDuration: string;
  private remainingDurationInterval = interval(1000).pipe(filter(() => this.isActive()));
  private remainingDurationSubscription: Subscription;

  constructor(
    private modalService: NgbModal,
  ) { }

  ngOnInit() {
    // setup the RemainingDuration countdown handlers, if the valve has the RemainingDuration Characteristic
    if (this.service.getCharacteristic('RemainingDuration')) {
      this.setupRemainingDurationCounter();
    }
  }

  isActive() {
    if (this.service && this.service.values) {
      if (this.service.getCharacteristic('Active').value === 1) {
        return true;
      } else {
        this.resetRemainingDuration();
        return false;
      }
    } else {
      return false;
    }
  }

  setupRemainingDurationCounter() {
    this.remainingDurationSubscription = this.remainingDurationInterval.subscribe(() => {
      this.secondsActive++;
      const remainingSeconds = this.service.getCharacteristic('RemainingDuration').value as number - this.secondsActive;
      if (remainingSeconds > 0) {
        this.remainingDuration = remainingSeconds < 3600 ?
          new Date(remainingSeconds * 1000).toISOString().substr(14, 5) : new Date(remainingSeconds * 1000).toISOString().substr(11, 8);
      } else {
        this.remainingDuration = '';
      }
    });
  }

  resetRemainingDuration() {
    this.secondsActive = 0;
    if (this.service.getCharacteristic('RemainingDuration')) {
      this.remainingDuration = '';
    }
  }

  onClick() {
    this.service.getCharacteristic('Active').setValue(!this.service.values.Active);
  }

  onLongClick() {
    if (!this.service.getCharacteristic('SetDuration')) {
      return;
    }

    const ref = this.modalService.open(ValveManageComponent, {
      size: 'sm',
    });
    ref.componentInstance.service = this.service;
  }

  ngOnDestroy() {
    if (this.remainingDurationSubscription) {
      this.remainingDurationSubscription.unsubscribe();
    }
  }
}
