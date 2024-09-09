import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { HumidifierDehumidifierManageComponent } from '@/app/core/accessories/types/humidifierdehumidifier/humidifierdehumidifier.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-humidifierdehumidifier',
  templateUrl: './humidifierdehumidifier.component.html',
  styleUrls: ['./humidifierdehumidifier.component.scss'],
})
export class HumidifierDehumidifierComponent {
  @Input() public service: ServiceTypeX
  model = 1

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    this.service.getCharacteristic('Active').setValue(this.service.values.Active ? 0 : 1)
  }

  onLongClick() {
    const ref = this.modalService.open(HumidifierDehumidifierManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
