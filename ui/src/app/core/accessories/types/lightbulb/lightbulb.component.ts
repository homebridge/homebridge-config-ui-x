import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { LightbulbManageComponent } from '@/app/core/accessories/types//lightbulb/lightbulb.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-lightbulb',
  templateUrl: './lightbulb.component.html',
  styleUrls: ['./lightbulb.component.scss'],
})
export class LightbulbComponent {
  @Input() public service: ServiceTypeX

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    this.service.getCharacteristic('On').setValue(!this.service.values.On)

    // set the brightness to 100% if on 0% when turned on
    if (!this.service.values.On && 'Brightness' in this.service.values && !this.service.values.Brightness) {
      this.service.getCharacteristic('Brightness').setValue(100)
    }
  }

  onLongClick() {
    if ('Brightness' in this.service.values) {
      const ref = this.modalService.open(LightbulbManageComponent, {
        size: 'md',
      })
      ref.componentInstance.service = this.service
    }
  }
}
