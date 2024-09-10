import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { SpeakerManageComponent } from '@/app/core/accessories/types/speaker/speaker.manage.component'
import { Component, Input } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'app-speaker',
  templateUrl: './speaker.component.html',
  styleUrls: ['./speaker.component.scss'],
})
export class SpeakerComponent {
  @Input() public service: ServiceTypeX

  constructor(
    private modalService: NgbModal,
  ) {}

  onClick() {
    this.service.getCharacteristic('Mute').setValue(!this.service.values.Mute)
  }

  onLongClick() {
    if ('Volume' in this.service.values) {
      const ref = this.modalService.open(SpeakerManageComponent, {
        size: 'sm',
      })
      ref.componentInstance.service = this.service
    }
  }
}
