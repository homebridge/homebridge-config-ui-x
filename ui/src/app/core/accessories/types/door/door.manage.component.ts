import { Component, inject, Input, OnInit, AfterViewInit, OnDestroy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject, interval } from 'rxjs'
import { debounceTime, takeUntil } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  templateUrl: './door.manage.component.html',
  standalone: true,
  imports: [
    NouisliderComponent,
    FormsModule,
    TranslatePipe,
  ],
})
export class DoorManageComponent implements OnInit, AfterViewInit, OnDestroy {
  private $activeModal = inject(NgbActiveModal)
  private translateService = inject(TranslateService)
  private destroy$ = new Subject<void>()

  @Input() public service: ServiceTypeX

  public targetMode: string
  public targetPositionChanged: Subject<string> = new Subject<string>()
  public targetPosition: {
    value: any
    min: number
    max: number
    step: number
  }
  public targetLabel: string
  public currentLabel: string

  constructor() {
    this.targetPositionChanged
      .pipe(debounceTime(500))
      .subscribe(() => {
        if (this.service.getCharacteristic('CurrentPosition').value < this.targetPosition.value) {
          this.service.values.PositionState = 1
        } else if (this.service.getCharacteristic('CurrentPosition').value > this.targetPosition.value) {
          this.service.values.PositionState = 0
        }
        this.service.getCharacteristic('TargetPosition').setValue(this.targetPosition.value)
      })
  }

  public ngOnInit() {
    this.targetMode = this.service.values.On
    this.targetLabel = this.translateService.instant('accessories.control.target')
    this.currentLabel = this.translateService.instant('accessories.control.current')
    this.loadTargetPosition()
  }

  public ngAfterViewInit() {
    // Set aria-labels and autofocus after sliders are rendered
    setTimeout(() => {
      const sliderElements = document.querySelectorAll('.noUi-target')
      
      if (sliderElements.length >= 2) {
        // First slider (target position)
        const targetSliderHandle = sliderElements[0].querySelector('[role="slider"]') as HTMLElement
        if (targetSliderHandle) {
          targetSliderHandle.setAttribute('aria-label', this.targetLabel)
          targetSliderHandle.setAttribute('aria-valuetext', `${this.targetPosition.value}%`)
          targetSliderHandle.focus() // Autofocus on target slider
        }
        
        // Second slider (current position)
        const currentSliderHandle = sliderElements[1].querySelector('[role="slider"]') as HTMLElement
        if (currentSliderHandle) {
          const currentValue = this.service.getCharacteristic('CurrentPosition').value
          currentSliderHandle.setAttribute('aria-label', `${this.currentLabel}, read-only`)
          currentSliderHandle.setAttribute('aria-valuetext', `${currentValue}%`)
        }
      }
      
      // Poll for current position changes and update aria-valuetext
      interval(500)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          const sliderElements = document.querySelectorAll('.noUi-target')
          if (sliderElements.length >= 2) {
            const currentSliderHandle = sliderElements[1].querySelector('[role="slider"]') as HTMLElement
            if (currentSliderHandle) {
              const currentValue = this.service.getCharacteristic('CurrentPosition').value
              currentSliderHandle.setAttribute('aria-valuetext', `${currentValue}%`)
            }
          }
        })
    }, 150)
  }

  public ngOnDestroy() {
    this.destroy$.next()
    this.destroy$.complete()
  }

  public onTargetPositionChange() {
    this.targetPositionChanged.next(this.targetPosition.value)
    
    // Update aria-valuetext to include percentage as slider moves
    setTimeout(() => {
      const targetSliderHandle = document.querySelector('.noUi-target [role="slider"]') as HTMLElement
      if (targetSliderHandle) {
        targetSliderHandle.setAttribute('aria-valuetext', `${this.targetPosition.value}%`)
      }
    }, 0)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private loadTargetPosition() {
    const TargetPosition = this.service.getCharacteristic('TargetPosition')

    if (TargetPosition) {
      this.targetPosition = {
        value: TargetPosition.value,
        min: TargetPosition.minValue,
        max: TargetPosition.maxValue,
        step: TargetPosition.minStep,
      }

      setTimeout(() => {
        const sliderElements = document.querySelectorAll('.noUi-target')
        sliderElements.forEach((sliderElement: HTMLElement) => {
          sliderElement.style.background = 'linear-gradient(to right, #242424, #ffd6aa)'
        })
      }, 10)
    }
  }
}
