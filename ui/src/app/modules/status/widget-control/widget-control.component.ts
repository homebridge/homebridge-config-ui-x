import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-widget-control',
  templateUrl: './widget-control.component.html',
  styleUrls: ['./widget-control.component.scss'],
})
export class WidgetControlComponent implements OnInit {
  @Input() widget;

  constructor(
    public activeModal: NgbActiveModal,
  ) { }

  ngOnInit() {
  }

}
