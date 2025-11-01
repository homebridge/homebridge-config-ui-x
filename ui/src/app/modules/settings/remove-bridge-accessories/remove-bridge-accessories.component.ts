import { NgClass } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './remove-bridge-accessories.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class RemoveBridgeAccessoriesComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public clicked: boolean = false
  public pairings: any[] = []
  public toDelete: { id: string, protocol: 'hap' | 'matter' }[] = []

  public ngOnInit(): void {
    this.loadPairings()
  }

  public cleanBridges() {
    this.clicked = true
    return this.$api.delete('/server/pairings/accessories', {
      body: this.toDelete,
    }).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('reset.accessory_ind.done'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
        void this.$router.navigate(['/restart'], {
          queryParams: { restarting: true },
        })
      },
      error: (error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.accessory_ind.fail'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public toggleList(id: string, protocol: 'hap' | 'matter') {
    if (this.toDelete.some(item => item.id === id && item.protocol === protocol)) {
      this.toDelete = this.toDelete.filter(item => item.id !== id || item.protocol !== protocol)
    } else {
      this.toDelete.push({ id, protocol })
    }
  }

  public isInList(id: string, protocol: 'hap' | 'matter'): boolean {
    return this.toDelete.some(item => item.id === id && item.protocol === protocol)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadPairings() {
    try {
      const rawPairings = (await firstValueFrom(this.$api.get('/server/pairings')))
        .filter((pairing: any) => pairing._category === 'bridge' && !pairing._main)
        .sort((a, b) => a.name.localeCompare(b.name))

      // Expand bridges with both HAP and Matter into separate entries
      this.pairings = []
      for (const pairing of rawPairings) {
        // Always add HAP entry
        this.pairings.push({
          ...pairing,
          _protocol: 'hap',
          _displayName: pairing.name,
        })

        // Add Matter entry if Matter is enabled on this bridge AND the feature is supported
        if (this.isMatterSupported && pairing._matter) {
          this.pairings.push({
            ...pairing,
            _protocol: 'matter',
            _displayName: pairing.name,
          })
        }
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('settings.unpair_bridge.load_error'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
