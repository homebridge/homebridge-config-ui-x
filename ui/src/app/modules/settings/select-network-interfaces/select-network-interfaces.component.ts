import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-select-network-interfaces',
  templateUrl: './select-network-interfaces.component.html',
  styleUrls: ['./select-network-interfaces.component.scss'],
})
export class SelectNetworkInterfacesComponent {
  @Input() availableNetworkAdapters: Record<string, any>;
  @Input() bridgeNetworkAdapters: Record<string, any>;

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  submit() {
    this.activeModal.close(
      this.availableNetworkAdapters.filter((x) => x.selected).map((x) => x.iface),
    );
  }
}
