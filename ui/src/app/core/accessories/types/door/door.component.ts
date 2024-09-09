import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { DoorManageComponent } from '@/app/core/accessories/types/door/door.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-door',
  templateUrl: './door.component.html',
  styleUrls: ['./door.component.scss'],
})
export class DoorComponent {
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
    const ref = this.modalService.open(DoorManageComponent, {
      size: 'md',
    })
    ref.componentInstance.service = this.service
  }
}
