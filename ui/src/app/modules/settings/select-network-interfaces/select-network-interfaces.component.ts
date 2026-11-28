import type { NetworkAdapterAvailable, NetworkAdapterSelected } from '@/app/modules/settings/settings.interfaces'

import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { NETWORK_INTERFACES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { RE_IPV6_LINK_LOCAL } from '@/app/core/regex.constants'

@Component({
  selector: 'app-select-network-interfaces',
  imports: [
    FormsModule,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './select-network-interfaces.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectNetworkInterfacesComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private modalData = inject(NETWORK_INTERFACES_MODAL_DATA)

  // Public properties for component use
  public adaptersAvailable: NetworkAdapterAvailable[] = this.modalData.adaptersAvailable
  public adaptersSelected: NetworkAdapterSelected[] = this.modalData.adaptersSelected
  // Older versions of Homebridge fail to start Matter when bridge.bind holds an address
  public canBindByAddress: boolean = this.modalData.canBindByAddress ?? false

  // Signals
  public readonly isUnchanged = signal(true)

  // Other properties
  // The bridge.bind entries the modal opened with: adapter names and IP addresses
  private adaptersOriginal: string[] = []
  // How each adapter was set when the modal opened, by adapter name
  private stateOriginal = new Map<string, { selected: boolean, bindBy: string }>()

  public ngOnInit(): void {
    // Set the `selected` and `bindBy` properties for each available adapter based on the selected adapters
    this.adaptersAvailable.forEach((adapter) => {
      // bridge.bind may name one adapter twice (by name and by address); the first entry is shown
      const chosen = this.adaptersSelected.find(x => x.iface === adapter.iface)
      adapter.selected = !!chosen
      adapter.bindBy = chosen?.entry ?? adapter.iface
      this.stateOriginal.set(adapter.iface, { selected: adapter.selected, bindBy: adapter.bindBy })
    })

    this.adaptersOriginal = this.adaptersSelected.map(x => x.entry)
  }

  /**
   * What an adapter can be bound by: its name, or one of its IP addresses.
   * An address keeps Homebridge on the same network when the adapter names change between
   * restarts, as they can in a Docker container on more than one network.
   *
   * An IPv6 link-local address (fe80::) is not offered. The point of an address is that it
   * stays the same, and an adapter makes up its own link-local address, which can change when
   * the adapter is created again. The adapter's `ip6` is that address when it has no other.
   */
  public bindOptions(adapter: NetworkAdapterAvailable): string[] {
    const addresses = this.canBindByAddress
      ? [adapter.ip4, adapter.ip6].filter(x => x && !RE_IPV6_LINK_LOCAL.test(x))
      : []
    // What config.json holds for the adapter always stays a choice. It may be an address other
    // than the two listed here, or one written by hand where addresses are not offered, and
    // leaving it out would turn it into a name the moment anything else in the modal is saved
    return [
      ...new Set([
        adapter.iface,
        ...addresses,
        this.stateOriginal.get(adapter.iface)?.bindBy,
        adapter.bindBy,
      ].filter((x): x is string => !!x)),
    ]
  }

  public onAdapterSelectionChange(): void {
    const entries = this.selectedEntries()
    this.isUnchanged.set(this.adaptersOriginal.length === entries.length
      && this.adaptersOriginal.every(original => entries.includes(original)))
  }

  public submit(): void {
    this.$activeModal.close(this.selectedEntries())
  }

  public closeAndReset(): void {
    // Reset the selected adapters to the original state
    this.adaptersAvailable.forEach((adapter) => {
      const original = this.stateOriginal.get(adapter.iface)
      adapter.selected = original?.selected ?? false
      adapter.bindBy = original?.bindBy ?? adapter.iface
    })
    this.isUnchanged.set(true)
    this.$activeModal.dismiss('Dismiss')
  }

  // The bridge.bind entries for the adapters now selected: each one's name, or the address chosen for it
  private selectedEntries(): string[] {
    return this.adaptersAvailable.filter(x => x.selected).map(x => x.bindBy || x.iface)
  }
}
