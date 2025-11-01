import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  templateUrl: './fan.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class FanManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

  public targetMode: boolean
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()
  public hasRotationDirection = false

  constructor() {
    this.targetRotationSpeedChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)

        // Turn the fan on or off when rotation speed is adjusted
        if (this.targetRotationSpeed.value && !this.targetMode) {
          this.targetMode = true
          if ('On' in this.service.values) {
            this.service.getCharacteristic('On').setValue(this.targetMode)
          } else if ('Active' in this.service.values) {
            this.service.getCharacteristic('Active').setValue(this.targetMode ? 1 : 0)
          }
        } else if (!this.targetRotationSpeed.value && this.targetMode) {
          this.targetMode = false
          if ('On' in this.service.values) {
            this.service.getCharacteristic('On').setValue(this.targetMode)
          } else if ('Active' in this.service.values) {
            this.service.getCharacteristic('Active').setValue(this.targetMode ? 1 : 0)
          }
        }
      })
  }

  public ngOnInit() {
    this.targetMode = ('On' in this.service.values)
      ? this.service.values.On
      : this.service.values.Active === 1

    this.loadRotationSpeed()

    if ('RotationDirection' in this.service.values) {
      this.hasRotationDirection = true
    }
  }

  public setTargetMode(value: boolean, event: MouseEvent) {
    this.targetMode = value

    if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(this.targetMode)
    } else if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.targetMode ? 1 : 0)
    }

    // Set the rotation speed to max if on 0% when turned on
    if (this.targetMode && this.targetRotationSpeed && !this.targetRotationSpeed.value) {
      this.targetRotationSpeed.value = this.service.getCharacteristic('RotationSpeed').maxValue
    }

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
  }

  public setRotationDirection(value: number, event: MouseEvent) {
    this.service.getCharacteristic('RotationDirection').setValue(value)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadRotationSpeed() {
    const RotationSpeed = this.service.getCharacteristic('RotationSpeed')

    if (RotationSpeed) {
      this.targetRotationSpeed = {
        value: RotationSpeed.value,
        min: RotationSpeed.minValue,
        max: RotationSpeed.maxValue,
        step: RotationSpeed.minStep,
        unit: RotationSpeed.unit,
      }

      setTimeout(() => {
        const sliderElements = document.querySelectorAll('.noUi-target')
        sliderElements.forEach((sliderElement: HTMLElement) => {
          sliderElement.style.background = 'linear-gradient(to right, #add8e6, #416bdf)'
        })
      }, 10)
    }
  }
}
