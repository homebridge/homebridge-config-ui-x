import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SecuritysystemManageComponent } from '@/app/core/accessories/types/securitysystem/securitysystem.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-securitysystem',
  templateUrl: './securitysystem.component.html',
  styleUrls: ['./securitysystem.component.scss'],
})
export class SecuritysystemComponent {
  @Input() public service: ServiceTypeX

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    const ref = this.modalService.open(SecuritysystemManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
