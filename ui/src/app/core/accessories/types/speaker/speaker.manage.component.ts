import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceTypeX } from '../../accessories.interfaces';

import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-speaker-manage',
  templateUrl: './speaker.manage.component.html',
  styleUrls: ['./speaker.component.scss'],
})
export class SpeakerManageComponent implements OnInit {
  @Input() public service: ServiceTypeX;
  public targetMode: any;
  public targetVolume: any;
  public targetVolumeChanged: Subject<string> = new Subject<string>();

  constructor(
    public activeModal: NgbActiveModal,
  ) {
    this.targetVolumeChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe((value) => {
        this.service.getCharacteristic('Volume').setValue(this.targetVolume.value);
      });
  }

  ngOnInit() {
    this.targetMode = this.service.values.Mute;

    this.loadTargetVolume();
  }

  loadTargetVolume() {
    const TargetVolume = this.service.getCharacteristic('Volume');

    if (TargetVolume) {
      this.targetVolume = {
        value: TargetVolume.value,
        min: TargetVolume.minValue,
        max: TargetVolume.maxValue,
        step: TargetVolume.minStep,
      };
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('Mute').setValue(this.targetMode);
  }

  onVolumeStateChange() {
    this.targetVolumeChanged.next(this.targetVolume.value);
  }
}
