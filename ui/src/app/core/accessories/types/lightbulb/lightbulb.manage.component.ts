import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'

import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-lightbulb-manage',
  templateUrl: './lightbulb.manage.component.html',
  styleUrls: ['./lightbulb.component.scss'],
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
  ],
})
export class LightbulbManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any
  public targetBrightness: any
  public targetBrightnessChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetBrightnessChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('Brightness').setValue(this.targetBrightness.value)

        // turn bulb on or off when brightness is adjusted
        if (this.targetBrightness.value && !this.service.values.On) {
          this.targetMode = true
          this.service.getCharacteristic('On').setValue(this.targetMode)
        } else if (!this.targetBrightness.value && this.service.values.On) {
          this.targetMode = false
          this.service.getCharacteristic('On').setValue(this.targetMode)
        }
      })
  }

  ngOnInit() {
    this.targetMode = this.service.values.On

    this.loadTargetBrightness()
  }

  loadTargetBrightness() {
    const TargetBrightness = this.service.getCharacteristic('Brightness')

    if (TargetBrightness) {
      this.targetBrightness = {
        value: TargetBrightness.value,
        min: TargetBrightness.minValue,
        max: TargetBrightness.maxValue,
        step: TargetBrightness.minStep,
      }
    }
  }

  onTargetStateChange() {
    this.service.getCharacteristic('On').setValue(this.targetMode)

    // set the brightness to 100% if on 0% when turned on
    if (this.targetMode && this.targetBrightness && !this.targetBrightness.value) {
      this.targetBrightness.value = 100
    }
  }

  onBrightnessStateChange() {
    this.targetBrightnessChanged.next(this.targetBrightness.value)
  }
}
