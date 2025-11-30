import type { CachedAccessory, Pairing } from '@/app/modules/settings/settings.interfaces'

import { Component, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/communication/api.service'
import { REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

@Component({
  templateUrl: './remove-individual-accessories.component.html',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
  ],
})
export class RemoveIndividualAccessoriesComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private modalData = inject(REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA)

  // Public properties for component use
  public selectedBridge = this.modalData.selectedBridge

  // Signals
  public pairings = signal<Pairing[]>([])
  public clicked = signal(false)
  public currentSelectedBridge = signal('')
  public selectedBridgeAccessories = signal<CachedAccessory[]>([])
  public accessoriesExist = signal(false)
  public toDelete = signal<{ cacheFile?: string, uuid: string, protocol: 'hap' | 'matter', deviceId?: string }[]>([])

  // Other properties
  private isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  public ngOnInit(): void {
    this.currentSelectedBridge.set(this.selectedBridge)
    void this.loadCachedAccessories()
  }

  public onBridgeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value
    this.currentSelectedBridge.set(value)
    this.selectedBridgeAccessories.set(this.pairings().find((pairing: Pairing) => pairing._id === this.currentSelectedBridge())?.accessories || [])
  }

  public getCurrentlySelectedBridge(): string {
    const pairing = this.pairings().find((pairing: Pairing) => pairing._id === this.currentSelectedBridge())
    if (!pairing) {
      return ''
    }
    return `${pairing.name} - ${pairing._username}`
  }

  public toggleList(uuid: string, cacheFile: string, protocol: 'hap' | 'matter', deviceId?: string): void {
    if (this.toDelete().some(item => item.uuid === uuid && item.cacheFile === cacheFile && item.protocol === protocol)) {
      this.toDelete.set(this.toDelete().filter(item => item.uuid !== uuid || item.cacheFile !== cacheFile || item.protocol !== protocol))
    } else {
      this.toDelete.update(list => [...list, { cacheFile, uuid, protocol, deviceId }])
    }
  }

  public isInList(id: string, cacheFile: string, protocol: 'hap' | 'matter'): boolean {
    return this.toDelete().some(item => item.uuid === id && item.cacheFile === cacheFile && item.protocol === protocol)
  }

  public async removeAccessories(): Promise<void> {
    this.clicked.set(true)

    // Separate HAP and Matter accessories
    const hapAccessories = this.toDelete()
      .filter(item => item.protocol === 'hap')
      .map(item => ({ uuid: item.uuid, cacheFile: item.cacheFile }))

    const matterAccessories = this.toDelete()
      .filter(item => item.protocol === 'matter')
      .map(item => ({ uuid: item.uuid, deviceId: item.deviceId }))

    // Build requests array
    const requests = []
    if (hapAccessories.length > 0) {
      requests.push(this.$api.delete('/server/cached-accessories', { body: hapAccessories }))
    }
    if (this.isMatterSupported && matterAccessories.length > 0) {
      requests.push(this.$api.delete('/server/matter-accessories', { body: matterAccessories }))
    }

    // Execute all deletion requests
    if (requests.length === 0) {
      this.clicked.set(false)
      return
    }

    // Use Promise.all to wait for all requests to complete
    try {
      await Promise.all(requests)
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

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadCachedAccessories(): Promise<void> {
    try {
      // Build requests array - only fetch Matter accessories if feature is enabled
      const requests: [Promise<any>, Promise<any>, Promise<any>] | [Promise<any>, Promise<any>] = this.isMatterSupported
        ? [
            this.$api.get('/server/cached-accessories'),
            this.$api.get('/server/matter-accessories'),
            this.$api.get('/server/pairings'),
          ]
        : [
            this.$api.get('/server/cached-accessories'),
            this.$api.get('/server/pairings'),
          ]

      const results = await Promise.all(requests)
      const cachedAccessories = results[0]
      const matterAccessories = this.isMatterSupported ? results[1] : []
      const pairings = this.isMatterSupported ? results[2] : results[1]

      const pairingMap = new Map<string, Pairing>(pairings.map((pairing: Pairing) => [pairing._id, { ...pairing, accessories: [] }]))

      // Process HAP accessories
      cachedAccessories
        .sort((a: CachedAccessory, b: CachedAccessory) => a.displayName.localeCompare(b.displayName))
        .forEach((accessory: CachedAccessory) => {
          const mainPairing = pairings.find((pairing: Pairing) => pairing._main)
          const bridge = accessory.$cacheFile?.split('.')?.[1] || mainPairing._id
          if (!this.selectedBridge || this.selectedBridge === bridge) {
            if (!pairingMap.has(bridge)) {
              pairingMap.set(bridge, {
                _id: bridge,
                _username: bridge.match(/.{1,2}/g).join(':'),
                name: this.$translate.instant('reset.accessory_ind.unknown'),
                accessories: [],
              })
            }
            accessory.$protocol = 'hap'
            pairingMap.get(bridge)!.accessories.push(accessory)
          }
        })

      // Process Matter accessories (only if feature is enabled)
      if (this.isMatterSupported) {
        matterAccessories
          .sort((a: CachedAccessory, b: CachedAccessory) => a.displayName.localeCompare(b.displayName))
          .forEach((accessory: CachedAccessory) => {
            const bridge = accessory.$deviceId
            if (!this.selectedBridge || this.selectedBridge === bridge) {
              if (!pairingMap.has(bridge)) {
                pairingMap.set(bridge, {
                  _id: bridge,
                  _username: bridge.match(/.{1,2}/g).join(':'),
                  name: this.$translate.instant('reset.accessory_ind.unknown'),
                  accessories: [],
                })
              }
              accessory.$protocol = 'matter'
              accessory.$cacheFile = bridge // Set cacheFile for compatibility with template
              pairingMap.get(bridge)!.accessories.push(accessory)
            }
          })
      }

      const pairingsList = Array.from(pairingMap.values())
        .filter((pairing: Pairing) => pairing.accessories.length > 0)
        .sort((a, b) => {
          if (a._main && !b._main) {
            return -1
          }
          if (!a._main && b._main) {
            return 1
          }
          return a.name.localeCompare(b.name)
        })

      this.pairings.set(pairingsList)
      const selectedBridgeId = this.selectedBridge || this.pairings()[0]?._id
      if (selectedBridgeId) {
        this.selectedBridge = selectedBridgeId
        this.currentSelectedBridge.set(selectedBridgeId)
        this.accessoriesExist.set(true)
        this.selectedBridgeAccessories.set(this.pairings().find((pairing: Pairing) => pairing._id === selectedBridgeId)?.accessories || [])
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.error_message'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
