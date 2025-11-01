import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  templateUrl: './security-system.manage.component.html',
  standalone: true,
  imports: [FormsModule, TranslatePipe, NgClass],
})
export class SecuritySystemManageComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX

  public targetMode: any
  public targetModeValidValues: number[] = []

  public ngOnInit() {
    this.targetMode = this.service.values.SecuritySystemTargetState
    this.targetModeValidValues = this.service.getCharacteristic('SecuritySystemTargetState').validValues as number[]
  }

  public setTargetMode(value: number, event: MouseEvent) {
    this.targetMode = value
    this.service.getCharacteristic('SecuritySystemTargetState').setValue(this.targetMode)

    const target = event.target as HTMLButtonElement
    target.blur()
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
