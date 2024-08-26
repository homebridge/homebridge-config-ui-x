import { Component } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-credits',
  templateUrl: './credits.component.html',
  styleUrls: ['./credits.component.scss'],
})
export class CreditsComponent {
  constructor(
    public activeModal: NgbActiveModal,
  ) { }
}
