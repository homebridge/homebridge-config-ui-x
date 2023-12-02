import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-information',
  templateUrl: './information.component.html',
  styleUrls: ['./information.component.scss'],
})
export class InformationComponent implements OnInit {
  @Input() title: string;
  @Input() subtitle: string | null;
  @Input() message: string;
  @Input() ctaButtonLabel: string;
  @Input() ctaButtonLink: string;
  @Input() faIconClass: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  ngOnInit() {}
}
