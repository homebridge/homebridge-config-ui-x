import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ThermostatManageComponent } from '@/app/core/accessories/types/thermostat/thermostat.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-thermostat',
  templateUrl: './thermostat.component.html',
  styleUrls: ['./thermostat.component.scss'],
})
export class ThermostatComponent {
  @Input() public service: ServiceTypeX
  model = 1

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    const ref = this.modalService.open(ThermostatManageComponent, {
      size: 'sm',
    })
    ref.componentInstance.service = this.service
  }
}
