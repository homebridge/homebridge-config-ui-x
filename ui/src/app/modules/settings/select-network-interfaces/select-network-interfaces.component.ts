import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './select-network-interfaces.component.html',
  imports: [
    FormsModule,
    TranslatePipe,
  ],
})
export class SelectNetworkInterfacesComponent {
  $activeModal = inject(NgbActiveModal)

  @Input() availableNetworkAdapters: any[] = []
  @Input() bridgeNetworkAdapters: string[] = []

  submit() {
    this.$activeModal.close(
      this.availableNetworkAdapters.filter((x: any) => x.selected).map((x: any) => x.iface),
    )
  }
}
