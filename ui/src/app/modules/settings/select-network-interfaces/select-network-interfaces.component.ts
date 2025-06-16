import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

interface NetworkAdapterAvailable {
  carrierChanges?: number
  default?: boolean
  dhcp?: boolean
  dnsSuffix?: string
  duplex?: string
  ieee8021xAuth?: string
  ieee8021xState?: string
  iface: string
  ifaceName: string
  internal: boolean
  ip4: string
  ip4subnet: string
  ip6: string
  ip6subnet: string
  mac: string
  mtu: number
  missing?: boolean
  operstate: string
  selected?: boolean
  speed: number
  type: string
  virtual?: boolean
}

@Component({
  templateUrl: './select-network-interfaces.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
  ],
})
export class SelectNetworkInterfacesComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() adaptersAvailable: NetworkAdapterAvailable[] = []

  private adaptersOriginal: string[] = []

  public isUnchanged = true

  constructor() {}

  ngOnInit() {
    this.adaptersOriginal = this.adaptersAvailable.filter(x => x.selected).map(x => x.iface)
  }

  onAdapterSelectionChange() {
    this.isUnchanged = this.adaptersOriginal.length === this.adaptersAvailable.filter(x => x.selected).length
      && this.adaptersOriginal.every(original => this.adaptersAvailable.some(x => x.iface === original && x.selected))
  }

  submit() {
    this.$activeModal.close(
      this.adaptersAvailable.filter(x => x.selected).map(x => x.iface),
    )
  }
}
