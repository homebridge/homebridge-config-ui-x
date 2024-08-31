import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  templateUrl: './disable-plugin.component.html',
})
export class DisablePluginComponent {
  @Input() pluginName: string;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}
}
