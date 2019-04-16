import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-add-room-modal',
  templateUrl: './add-room-modal.component.html',
})
export class AddRoomModalComponent implements OnInit {
  @Input() public roomName;

  constructor(
    public activeModal: NgbActiveModal,
  ) { }

  ngOnInit() {
  }

}
