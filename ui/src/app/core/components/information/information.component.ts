import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-confirm',
  templateUrl: './information.component.html',
  styleUrls: ['./information.component.scss'],
})
export class InformationComponent implements OnInit {
  @Input() title: string;
  @Input() message: string;
  @Input() ctaButtonLabel: string;
  @Input() ctaButtonLink: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit() {}
}
