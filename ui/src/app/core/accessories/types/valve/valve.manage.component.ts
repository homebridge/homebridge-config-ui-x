import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { Subject } from 'rxjs';

@Component({
  selector: 'app-valve-manage',
  templateUrl: './valve.manage.component.html',
  styleUrls: ['./valve.component.scss'],
})
export class ValveManageComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  private durationSeconds = [300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600];
  public availableSetDurations = [];
  public targetSetDuration: number;

  constructor(
    public activeModal: NgbActiveModal,
  ) { }

  ngOnInit() {
    this.targetSetDuration = this.service.values.SetDuration;

    if (!this.durationSeconds.includes(this.targetSetDuration)) {
      this.durationSeconds.unshift(this.targetSetDuration);
    }

    this.availableSetDurations = this.durationSeconds.map((seconds) => {
      const label = seconds < 3600 ?
        new Date(seconds * 1000).toISOString().substr(14, 5) : new Date(seconds * 1000).toISOString().substr(11, 8);
      return { seconds, label };
    });
  }

  onSetDurationChange() {
    this.service.getCharacteristic('SetDuration').setValue(this.targetSetDuration);
  }
}
