import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { QrcodeComponent } from '@/app/core/components/qrcode/qrcode.component'
import { PLUGIN_EXTERNALS_MODAL_DATA } from '@/app/core/modal-data-tokens'

interface ExternalAccessoryPairing {
  _id: string
  _username: string
  _isPaired: boolean
  _setupCode?: string
  _matter?: boolean
  _matterOnly?: boolean
  _port?: number
  pincode?: string
  name?: string
  displayName?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
}

@Component({
  selector: 'app-plugin-externals',
  imports: [
    FormsModule,
    QrcodeComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './plugin-externals.component.html',
  styleUrl: './plugin-externals.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PluginExternalsComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $pairingsCache = inject(ServerPairingsCacheService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(PLUGIN_EXTERNALS_MODAL_DATA)

  public plugin = this.modalData.plugin
  public readonly loading = signal(true)
  public readonly accessories = signal<ExternalAccessoryPairing[]>([])
  public readonly selectedIndex = signal<string>('0')
  public readonly defaultIcon = 'assets/hb-icon.png'

  public readonly selected = computed<ExternalAccessoryPairing | undefined>(() => {
    const list = this.accessories()
    if (list.length === 0) {
      return undefined
    }
    const idx = Number.parseInt(this.selectedIndex(), 10)
    return list[Number.isFinite(idx) ? idx : 0]
  })

  public ngOnInit(): void {
    void this.loadAccessories()
  }

  public closeModal(): void {
    this.$activeModal.dismiss()
  }

  public handleIconError(event: Event): void {
    (event.target as HTMLImageElement).src = this.defaultIcon
  }

  private async loadAccessories(): Promise<void> {
    try {
      const pairings = await this.$pairingsCache.get<any[]>()
      const filtered: ExternalAccessoryPairing[] = (pairings ?? [])
        .filter(p => p._plugin === this.plugin.name && (p._isExternal === true || p._matterOnly === true))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      this.accessories.set(filtered)
    } catch (error) {
      console.error(error)
      this.$toastr.error(
        this.$translate.instant('external_accessories.toast_failed_to_load'),
        this.$translate.instant('toast.title_error'),
      )
      this.accessories.set([])
    } finally {
      this.loading.set(false)
    }
  }
}
