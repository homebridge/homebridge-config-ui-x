import type { Pairing } from '@/app/modules/settings/settings.interfaces'

import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './remove-individual-accessories.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
    FormsModule,
  ],
})
export class RemoveIndividualAccessoriesComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private isMatterSupported = this.$settings.isFeatureEnabled('matterSupport')

  @Input() selectedBridge: string = ''

  public pairings: any[] = []
  public clicked: boolean = false
  public selectedBridgeAccessories: any[] = []
  public accessoriesExist: boolean = false
  public toDelete: { cacheFile?: string, uuid: string, protocol: 'hap' | 'matter', deviceId?: string }[] = []

  public ngOnInit(): void {
    this.loadCachedAccessories()
  }

  public onBridgeChange(value: string) {
    this.selectedBridge = value
    this.selectedBridgeAccessories = this.pairings.find((pairing: any) => pairing._id === this.selectedBridge)?.accessories
  }

  public getCurrentlySelectedBridge() {
    const pairing = this.pairings.find((pairing: any) => pairing._id === this.selectedBridge)
    return `${pairing.name} - ${pairing._username}`
  }

  public toggleList(uuid: string, cacheFile: string, protocol: 'hap' | 'matter', deviceId?: string) {
    if (this.toDelete.some(item => item.uuid === uuid && item.cacheFile === cacheFile && item.protocol === protocol)) {
      this.toDelete = this.toDelete.filter(item => item.uuid !== uuid || item.cacheFile !== cacheFile || item.protocol !== protocol)
    } else {
      this.toDelete.push({ cacheFile, uuid, protocol, deviceId })
    }
  }

  public isInList(id: string, cacheFile: string, protocol: 'hap' | 'matter') {
    return this.toDelete.some(item => item.uuid === id && item.cacheFile === cacheFile && item.protocol === protocol)
  }

  public removeAccessories() {
    this.clicked = true

    // Separate HAP and Matter accessories
    const hapAccessories = this.toDelete
      .filter(item => item.protocol === 'hap')
      .map(item => ({ uuid: item.uuid, cacheFile: item.cacheFile }))

    const matterAccessories = this.toDelete
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
      this.clicked = false
      return
    }

    // Use Promise.all to wait for all requests to complete
    Promise.all(requests.map(req => firstValueFrom(req)))
      .then(() => {
        this.$toastr.success(this.$translate.instant('reset.accessory_ind.done'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
        void this.$router.navigate(['/restart'], {
          queryParams: { restarting: true },
        })
      })
      .catch((error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.accessory_ind.fail'), this.$translate.instant('toast.title_error'))
      })
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  private async loadCachedAccessories() {
    try {
      // Build requests array - only fetch Matter accessories if feature is enabled
      const requests: [Promise<any>, Promise<any>, Promise<any>] | [Promise<any>, Promise<any>] = this.isMatterSupported
        ? [
            firstValueFrom(this.$api.get('/server/cached-accessories')),
            firstValueFrom(this.$api.get('/server/matter-accessories')),
            firstValueFrom(this.$api.get('/server/pairings')),
          ]
        : [
            firstValueFrom(this.$api.get('/server/cached-accessories')),
            firstValueFrom(this.$api.get('/server/pairings')),
          ]

      const results = await Promise.all(requests)
      const cachedAccessories = results[0]
      const matterAccessories = this.isMatterSupported ? results[1] : []
      const pairings = this.isMatterSupported ? results[2] : results[1]

      const pairingMap = new Map<string, Pairing>(pairings.map((pairing: any) => [pairing._id, { ...pairing, accessories: [] }]))

      // Process HAP accessories
      cachedAccessories
        .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
        .forEach((accessory: any) => {
          const mainPairing = pairings.find((pairing: any) => pairing._main)
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
          .sort((a: any, b: any) => a.displayName.localeCompare(b.displayName))
          .forEach((accessory: any) => {
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

      this.pairings = Array.from(pairingMap.values())
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

      this.selectedBridge = this.selectedBridge || this.pairings[0]?._id
      if (this.selectedBridge) {
        this.accessoriesExist = true
        this.selectedBridgeAccessories = this.pairings[0].accessories
      }
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('reset.error_message'), this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }
}
