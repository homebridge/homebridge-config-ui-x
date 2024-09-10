import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { WindowcoveringManageComponent } from '@/app/core/accessories/types/windowcovering/windowcovering.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-windowcovering',
  templateUrl: './windowcovering.component.html',
  styleUrls: ['./windowcovering.component.scss'],
})
export class WindowCoveringComponent {
  @Input() public service: ServiceTypeX

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    if (this.service.values.TargetPosition) {
      this.service.getCharacteristic('TargetPosition').setValue(0)
    } else {
      this.service.getCharacteristic('TargetPosition').setValue(100)
    }
  }

  onLongClick() {
    const ref = this.modalService.open(WindowcoveringManageComponent, {
      size: 'md',
    })
    ref.componentInstance.service = this.service
  }
}
