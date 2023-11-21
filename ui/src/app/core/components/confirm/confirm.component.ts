import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm',
  templateUrl: './confirm.component.html',
  styleUrls: ['./confirm.component.scss'],
})
export class ConfirmComponent implements OnInit {
  @Input() title: string;
  @Input() message: string;
  @Input() confirmButtonLabel: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit() {}
}
