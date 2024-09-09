import { Component, Input } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  templateUrl: './select-network-interfaces.component.html',
})
export class SelectNetworkInterfacesComponent {
  @Input() availableNetworkAdapters: Record<string, any>
  @Input() bridgeNetworkAdapters: Record<string, any>

  constructor(
    public activeModal: NgbActiveModal,
  ) {}

  submit() {
    this.activeModal.close(
      this.availableNetworkAdapters.filter(x => x.selected).map(x => x.iface),
    )
  }
}
