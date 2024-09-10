import { Component } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './credits.component.html',
})
export class CreditsComponent {
  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}
