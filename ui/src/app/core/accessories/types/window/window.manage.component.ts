import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-window-manage',
  templateUrl: './window.manage.component.html',
  styleUrls: ['./window.component.scss'],
})
export class WindowManageComponent implements OnInit {
  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetPosition: any
  public targetPositionChanged: Subject<string> = new Subject<string>()

  constructor(
    public activeModal: NgbActiveModal,
  ) {
    this.targetPositionChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        if (this.service.getCharacteristic('CurrentPosition').value < this.targetPosition.value) {
          this.service.values.PositionState = 1
        } else if (this.service.getCharacteristic('CurrentPosition').value > this.targetPosition.value) {
          this.service.values.PositionState = 0
        }
        this.service.getCharacteristic('TargetPosition').setValue(this.targetPosition.value)
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.On
    this.loadTargetPosition()
  }

  loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue,
        max: TargetPosition.maxValue,
        step: TargetPosition.minStep,
      }
    }
  }

  onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
  }
}
