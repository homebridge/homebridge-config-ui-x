import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SecuritysystemManageComponent } from '@/app/core/accessories/types/securitysystem/securitysystem.manage.component'
import { NgClass } from '@angular/common'
import { Component, inject, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { InlineSVGModule } from 'ng-inline-svg-2'
import { LongClickDirective } from '../../../directives/longclick.directive'

@Component({
  selector: 'app-securitysystem',
  templateUrl: './securitysystem.component.html',
  styleUrls: ['./securitysystem.component.scss'],
  imports: [
    LongClickDirective,
    NgClass,
    InlineSVGModule,
    TranslatePipe,
  ],
})
export class SecuritysystemComponent {
  private $modal = inject(NgbModal)

  @Input() public service: ServiceTypeX

  onClick() {
    const ref = this.$modal.open(SecuritysystemManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
