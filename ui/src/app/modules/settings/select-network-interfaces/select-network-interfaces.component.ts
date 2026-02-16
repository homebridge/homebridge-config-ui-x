import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { NETWORK_INTERFACES_MODAL_DATA } from '@/app/core/modal-data-tokens'

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
  public adaptersAvailable = this.modalData.adaptersAvailable
  public adaptersSelected = this.modalData.adaptersSelected

  // Signals
  public readonly isUnchanged = signal(true)

  // Other properties
  private adaptersOriginal: string[] = []

  public ngOnInit(): void {
    // Set the `selected` property for each available adapter based on the selected adapters
    this.adaptersAvailable.forEach((adapter) => {
      adapter.selected = this.adaptersSelected.some(x => x.iface === adapter.iface)
    })

    this.adaptersOriginal = this.adaptersSelected.map(x => x.iface)
  }

  public onAdapterSelectionChange(): void {
    this.isUnchanged.set(this.adaptersOriginal.length === this.adaptersAvailable.filter(x => x.selected).length
      && this.adaptersOriginal.every(original => this.adaptersAvailable.some(x => x.iface === original && x.selected)))
  }

  public submit(): void {
    this.$activeModal.close(
      this.adaptersAvailable.filter(x => x.selected).map(x => x.iface),
    )
  }

  public closeAndReset(): void {
    // Reset the selected adapters to the original state
    this.adaptersAvailable.forEach((adapter) => {
      adapter.selected = this.adaptersOriginal.includes(adapter.iface)
    })
    this.isUnchanged.set(true)
    this.$activeModal.dismiss('Dismiss')
  }
}
