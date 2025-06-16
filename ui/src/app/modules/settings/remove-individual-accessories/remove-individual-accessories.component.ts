import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'

interface Pairing {
  _id: string
  _username: string
  _main?: boolean
  name: string
  accessories: any[]
}

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
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $router = inject(Router)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  public pairings: any[] = []

  @Input() selectedBridge: string = ''
  public clicked: boolean = false
  public selectedBridgeAccessories: any[] = []
  public accessoriesExist: boolean = false
  public toDelete: { cacheFile: string, uuid: string }[] = []

  constructor() {}

  ngOnInit(): void {
    this.loadCachedAccessories()
  }

  async loadCachedAccessories() {
    try {
      const [cachedAccessories, pairings] = await Promise.all([
        firstValueFrom(this.$api.get('/server/cached-accessories')),
        firstValueFrom(this.$api.get('/server/pairings')),
      ])

      const pairingMap = new Map<string, Pairing>(pairings.map((pairing: any) => [pairing._id, { ...pairing, accessories: [] }]))
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
            pairingMap.get(bridge)!.accessories.push(accessory)
          }
        })

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

  onBridgeChange(value: string) {
    this.selectedBridge = value
    this.selectedBridgeAccessories = this.pairings.find((pairing: any) => pairing._id === this.selectedBridge)?.accessories
  }

  getCurrentlySelectedBridge() {
    const pairing = this.pairings.find((pairing: any) => pairing._id === this.selectedBridge)
    return `${pairing.name} - ${pairing._username}`
  }

  toggleList(uuid: string, cacheFile: string) {
    if (this.toDelete.some((item: { cacheFile: string, uuid: string }) => item.uuid === uuid && item.cacheFile === cacheFile)) {
      this.toDelete = this.toDelete.filter((item: { cacheFile: string, uuid: string }) => item.uuid !== uuid || item.cacheFile !== cacheFile)
    } else {
      this.toDelete.push({ cacheFile, uuid })
    }
  }

  isInList(id: string, cacheFile: string) {
    return this.toDelete.some((item: { cacheFile: string, uuid: string }) => item.uuid === id && item.cacheFile === cacheFile)
  }

  removeAccessories() {
    this.clicked = true
    return this.$api.delete('/server/cached-accessories', {
      body: this.toDelete,
    }).subscribe({
      next: () => {
        this.$toastr.success(this.$translate.instant('reset.accessory_ind.done'), this.$translate.instant('toast.title_success'))
        this.$activeModal.close()
        this.$router.navigate(['/restart'], { queryParams: { restarting: true } })
      },
      error: (error) => {
        this.clicked = false
        console.error(error)
        this.$toastr.error(this.$translate.instant('reset.accessory_ind.fail'), this.$translate.instant('toast.title_error'))
      },
    })
  }
}
