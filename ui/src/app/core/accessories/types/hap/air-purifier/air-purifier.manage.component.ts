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
  templateUrl: './air-purifier.manage.component.html',
  styleUrls: ['./air-purifier.component.scss'],
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class AirPurifierManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

  public targetState: number
  public targetMode: number
  public targetModeValidValues: number[] = []
  public targetRotationSpeed: any
  public targetRotationSpeedChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetRotationSpeedChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        this.service.getCharacteristic('RotationSpeed').setValue(this.targetRotationSpeed.value)

        // Turn the air purifier on or off when rotation speed is adjusted
        if (this.targetRotationSpeed.value && !this.targetState) {
          this.targetState = 1
          if ('Active' in this.service.values) {
            this.service.getCharacteristic('Active').setValue(1)
          } else if ('On' in this.service.values) {
            this.service.getCharacteristic('On').setValue(true)
          }
        } else if (!this.targetRotationSpeed.value && this.targetState) {
          this.targetState = 0
          if ('Active' in this.service.values) {
            this.service.getCharacteristic('Active').setValue(0)
          } else if ('On' in this.service.values) {
            this.service.getCharacteristic('On').setValue(false)
          }
        }
      })
  }

  public ngOnInit() {
    this.targetState = 'Active' in this.service.values
      ? this.service.values.Active
      : (this.service.values.On ? 1 : 0)
    this.targetMode = this.service.values.TargetAirPurifierState
    if ('TargetAirPurifierState' in this.service.values) {
      this.targetModeValidValues = this.service.getCharacteristic('TargetAirPurifierState').validValues as number[]
    }
    this.loadRotationSpeed()
  }

  public setTargetState(value: number, event: MouseEvent) {
    this.targetState = value
    if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(this.targetState)
    } else if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(this.targetState === 1)
    }

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('TargetAirPurifierState').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public onTargetRotationSpeedChange() {
    this.targetRotationSpeedChanged.next(this.targetRotationSpeed.value)
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
