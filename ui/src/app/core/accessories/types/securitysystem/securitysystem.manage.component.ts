import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-securitysystem.manage',
  templateUrl: './securitysystem.manage.component.html',
  styleUrls: ['./securitysystem.component.scss'],
  imports: [FormsModule, TranslatePipe],
})
export class SecuritysystemManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetMode: any

  ngOnInit() {
    this.targetMode = this.service.values.SecuritySystemTargetState
  }

  onTargetStateChange() {
    this.service.getCharacteristic('SecuritySystemTargetState').setValue(this.targetMode)
  }
}
