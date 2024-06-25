import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm',
  templateUrl: './confirm.component.html',
  styleUrls: ['./confirm.component.scss'],
})
export class ConfirmComponent {
  @Input() title: string;
  @Input() message: string;
  @Input() confirmButtonLabel: string;
  @Input() confirmButtonClass: string;
  @Input() faIconClass: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}
