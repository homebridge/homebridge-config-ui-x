import { TitleCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AccessoryOverviewCacheService } from '@/app/core/caching/accessory-overview-cache.service'
import { ApiService } from '@/app/core/communication/api.service'
import { ACCESSORY_CONTROL_LISTS_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { Pairing } from '@/app/modules/settings/accessory-control-lists/accessory-control-lists.interfaces'

@Component({
  selector: 'app-accessory-control-lists',
  imports: [
    TranslatePipe,
    FormsModule,
    TitleCasePipe,
    NgbTooltip,
  ],
  standalone: true,
  templateUrl: './accessory-control-lists.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoryControlListsComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $accessoryOverview = inject(AccessoryOverviewCacheService)
  private $api = inject(ApiService)
  private $errors = inject(HttpErrorService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(ACCESSORY_CONTROL_LISTS_MODAL_DATA)

  // Signals
  public readonly clicked = signal(false)
  public readonly mainPairing = signal<Pairing | undefined>(undefined)
  public readonly pairings = signal<Pairing[]>([])

  // Other properties
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')
  private originalBlacklist: string[] = []
  private updatedBlacklist: string[] = []

  get blacklistHasUpdated(): boolean {
    return this.updatedBlacklist.join(',') !== this.originalBlacklist.join(',')
  }

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    this.updatedBlacklist = this.modalData.existingBlacklist
      .map(x => x.trim().toUpperCase())
      .sort((a, b) => a.localeCompare(b))
    this.originalBlacklist = [...this.updatedBlacklist]

    try {
      const { pairings } = await this.$accessoryOverview.get<any, any, Pairing>()
      this.mainPairing.set(pairings.find((p: Pairing) => p._main))
      this.pairings.set(pairings
        .filter((p: Pairing) => !p._main)
        .sort((a: Pairing, b: Pairing) => a.name.localeCompare(b.name)))
    } catch (error: any) {
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  public toggleList(username: string): void {
    if (this.updatedBlacklist.includes(username)) {
      this.updatedBlacklist = this.updatedBlacklist.filter(x => x !== username)
    } else {
      this.updatedBlacklist.push(username)
      this.updatedBlacklist.sort((a, b) => a.localeCompare(b))
    }
  }

  public isInList(username: string): boolean {
    return this.updatedBlacklist.includes(username)
  }

  public async updateBlacklist(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.put('/config-editor/ui/accessory-control/instance-blacklist', {
        body: this.updatedBlacklist,
      })
      this.$settings.setEnvItem('accessoryControl.instanceBlacklist', this.updatedBlacklist)
      this.$activeModal.close()
    } catch (error: any) {
      this.clicked.set(false)
      console.error(error)
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
