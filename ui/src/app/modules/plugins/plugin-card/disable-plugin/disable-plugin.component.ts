import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-disable-plugin',
  templateUrl: './disable-plugin.component.html',
  styleUrls: ['./disable-plugin.component.scss'],
})
export class DisablePluginComponent {
  @Input() pluginName: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}
