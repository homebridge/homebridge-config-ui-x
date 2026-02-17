import { TitleCasePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { Pairing } from '@/app/modules/settings/settings.interfaces'

@Component({
  selector: 'app-reset-individual-bridges',
  imports: [
    TitleCasePipe,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './reset-individual-bridges.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetIndividualBridgesComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public readonly clicked = signal(false)
  public readonly pairingsNonChild = signal<any[]>([])
  public readonly pairingsChildActive = signal<any[]>([])
  public readonly pairingsChildStale = signal<any[]>([])
  public readonly toDelete = signal<{ id: string, resetPairingInfo: boolean }[]>([])

  // Other properties
  public isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public ngOnInit(): void {
    void this.loadPairings()
  }

  public toggleList(id: string, resetPairingInfo: boolean = false): void {
    if (this.toDelete().some((item: { id: string }) => item.id === id)) {
      this.toDelete.set(this.toDelete().filter((item: { id: string, resetPairingInfo: boolean }) => item.id !== id))
    } else {
      this.toDelete.update(list => [...list, { id, resetPairingInfo }])
    }
  }

  public isInList(id: string): boolean {
    return this.toDelete().some((item: { id: string }) => item.id === id)
  }

  public async removeBridges(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.delete('/server/pairings', {
        body: this.toDelete(),
      })
      this.$activeModal.close()
      void this.$router.navigate(['/restart'], {
        queryParams: { restarting: true },
      })
      this.$toastr.success(this.$translate.instant('reset.bridge_ind.done'), this.$translate.instant('toast.title_success'))
    } catch (error) {
      this.clicked.set(false)
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.bridge_ind.fail'), this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadPairings(): Promise<void> {
    try {
      const pairings = (await this.$api.get('/server/pairings'))
        .filter((pairing: any) => !pairing._main)
        .sort((a: Pairing, b: Pairing) => a.name.localeCompare(b.name))

      this.pairingsChildActive.set(pairings.filter((pairing: any) => pairing._category === 'bridge' && !pairing._couldBeStale))
      this.pairingsNonChild.set(pairings.filter((pairing: any) => pairing._category !== 'bridge'))
      this.pairingsChildStale.set(pairings.filter((pairing: any) => pairing._category === 'bridge' && pairing._couldBeStale))
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
