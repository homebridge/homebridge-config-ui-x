import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { RESET_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ChildBridge } from '@/app/core/plugins/manage-plugins.interfaces'
import { ResetAccessoriesDeleteItem, ResetAccessoriesPairing } from '@/app/core/plugins/reset-accessories/reset-accessories.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reset-accessories.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
  ],
})
export class ResetAccessoriesComponent implements OnInit {
  // 1. Injected Dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(RESET_ACCESSORIES_MODAL_DATA)

  // 2. Public properties (from injected data)
  public childBridges: ChildBridge[] = this.modalData.childBridges ?? []

  // 3. Signals
  public clicked = signal(false)
  public pairings = signal<ResetAccessoriesPairing[]>([])
  public toDelete = signal<ResetAccessoriesDeleteItem[]>([])

  // 4. Other Properties
  public readonly isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  // 7. Lifecycle Hooks
  public ngOnInit(): void {
    void this.loadPairings()
  }

  // 8. Public Methods
  public toggleList(id: string, protocol: 'hap' | 'matter'): void {
    const currentList = this.toDelete()
    if (currentList.some(item => item.id === id && item.protocol === protocol)) {
      this.toDelete.set(currentList.filter(item => item.id !== id || item.protocol !== protocol))
    } else {
      this.toDelete.update(current => [...current, { id, protocol }])
    }
  }

  public isInList(id: string, protocol: 'hap' | 'matter'): boolean {
    return this.toDelete().some(item => item.id === id && item.protocol === protocol)
  }

  public async cleanBridges(): Promise<void> {
    this.clicked.set(true)
    try {
      await this.$api.delete('/server/pairings/accessories', {
        body: this.toDelete(),
      })
      this.$toastr.success(
        this.$translate.instant('reset.accessory_ind.done'),
        this.$translate.instant('toast.title_success'),
      )
      this.$activeModal.close()
      void this.$router.navigate(['/restart'], {
        queryParams: { restarting: true },
      })
    } catch (error) {
      this.clicked.set(false)
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to clean bridges'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  // 9. Private Methods
  private async loadPairings(): Promise<void> {
    try {
      const allPairings = await this.$api.get<any[]>('/server/pairings')

      // Get the plugin name from the first child bridge (all child bridges should have the same plugin)
      const pluginName = this.childBridges.length > 0 ? this.childBridges[0].plugin : null

      // Filter HAP child bridges that belong to this plugin
      const rawPairings = allPairings
        .filter((pairing: any) => {
          return pairing._category === 'bridge'
            && !pairing._main
            && this.childBridges.find(childBridge => childBridge.username === pairing._username)
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      // Filter Matter-only external accessories that belong to this plugin
      const matterOnlyPairings = allPairings
        .filter((pairing: any) => {
          return pairing._matterOnly && pairing._plugin === pluginName
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      // Expand bridges with both HAP and Matter into separate entries
      const newPairings: ResetAccessoriesPairing[] = []
      for (const pairing of rawPairings) {
        // Always add HAP entry
        newPairings.push({
          ...pairing,
          _protocol: 'hap',
          _displayName: pairing.name,
        })

        // Add Matter entry if Matter is enabled on this bridge AND the feature is supported
        if (this.isMatterSupported && pairing._matter) {
          newPairings.push({
            ...pairing,
            _protocol: 'matter',
            _displayName: pairing.name,
          })
        }
      }

      // Add Matter-only external accessories
      if (this.isMatterSupported) {
        for (const pairing of matterOnlyPairings) {
          newPairings.push({
            ...pairing,
            _protocol: 'matter',
            _displayName: pairing.name,
          })
        }
      }

      this.pairings.set(newPairings)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : 'Failed to load pairings'
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
