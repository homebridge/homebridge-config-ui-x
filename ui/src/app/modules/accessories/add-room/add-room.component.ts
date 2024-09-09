import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './add-room.component.html',
})
export class AddRoomComponent {
  @Input() public roomName: string

  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}
