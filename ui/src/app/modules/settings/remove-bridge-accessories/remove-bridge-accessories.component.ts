import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { SettingsService } from '@/app/core/ui/settings.service'
import { Pairing } from '@/app/modules/settings/settings.interfaces'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './remove-bridge-accessories.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class RemoveBridgeAccessoriesComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  // Signals
  public clicked = signal(false)
  public pairings = signal<any[]>([])
  public toDelete = signal<{ id: string, protocol: 'hap' | 'matter' }[]>([])

  // Other properties
  private isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public ngOnInit(): void {
    void this.loadPairings()
  }

  public async cleanBridges(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.delete('/server/pairings/accessories', {
        body: this.toDelete(),
      })
      this.$toastr.success(this.$translate.instant('reset.accessory_ind.done'), this.$translate.instant('toast.title_success'))
      this.$activeModal.close()
      void this.$router.navigate(['/restart'], {
        queryParams: { restarting: true },
      })
    } catch (error) {
      this.clicked.set(false)
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.accessory_ind.fail'), this.$translate.instant('toast.title_error'))
    }
  }

  public toggleList(id: string, protocol: 'hap' | 'matter'): void {
    if (this.toDelete().some(item => item.id === id && item.protocol === protocol)) {
      this.toDelete.set(this.toDelete().filter(item => item.id !== id || item.protocol !== protocol))
    } else {
      this.toDelete.update(list => [...list, { id, protocol }])
    }
  }

  public isInList(id: string, protocol: 'hap' | 'matter'): boolean {
    return this.toDelete().some(item => item.id === id && item.protocol === protocol)
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadPairings(): Promise<void> {
    try {
      const rawPairings = (await this.$api.get('/server/pairings'))
        .filter((pairing: any) => pairing._category === 'bridge' && !pairing._main)
        .sort((a: Pairing, b: Pairing) => a.name.localeCompare(b.name))

      // Expand bridges with both HAP and Matter into separate entries
      const pairingsList = []
      for (const pairing of rawPairings) {
        // Always add HAP entry
        pairingsList.push({
          ...pairing,
          _protocol: 'hap',
          _displayName: pairing.name,
        })

        // Add Matter entry if Matter is enabled on this bridge AND the feature is supported
        if (this.isMatterSupported && pairing._matter) {
          pairingsList.push({
            ...pairing,
            _protocol: 'matter',
            _displayName: pairing.name,
          })
        }
      }
      this.pairings.set(pairingsList)
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
