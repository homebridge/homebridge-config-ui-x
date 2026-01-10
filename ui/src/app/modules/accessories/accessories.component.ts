import { NgClass } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { firstValueFrom, Subscription } from 'rxjs'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { ApiService } from '@/app/core/api.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
  standalone: true,
  imports: [
    NgbTooltip,
    NgClass,
    DragulaModule,
    AccessoryTileComponent,
    DragHerePlaceholderComponent,
    TranslatePipe,
    SpinnerComponent,
    FormsModule,
  ],
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  protected $accessories = inject(AccessoriesService)

  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $md = inject(MobileDetectService)
  private $translate = inject(TranslateService)
  private orderSubscription: Subscription

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  public isMobile: any = false
  public hideHidden = true
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public hasPlugins = false
  public loading = true
  public selectedBridge = ''
  public availableBridges: string[] = []

  constructor() {
    const dragulaService = this.dragulaService

    this.isMobile = this.$md.detect.mobile()

    // Disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => !this.isMobile && handle.classList.contains('drag-handle'),
    })

    // Disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: el => !this.isMobile && !el.classList.contains('no-drag'),
    })

    // Save the room and service layout
    this.orderSubscription = dragulaService.drop().subscribe(() => {
      setTimeout(() => {
        this.$accessories.saveLayout()
      })
    })

    this.isMobile = true
  }

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.label_accessories')
    this.$settings.setPageTitle(title)

    this.$accessories.start()
    this.checkForPlugins()

    // Subscribe to accessory data to update available bridges
    this.$accessories.accessoryData.subscribe(() => {
      this.updateAvailableBridges()
    })
  }

  public addRoom() {
    this.$modal
      .open(AddRoomComponent, {
        size: 'lg',
        backdrop: 'static',
      })
      .result
      .then((roomName) => {
      // No room name provided
        if (!roomName || !roomName.length) {
          return
        }

        // Duplicate room name
        if (this.$accessories.rooms.find(r => r.name === roomName)) {
          return
        }

        this.$accessories.rooms.push({
          name: roomName,
          services: [],
        })

        if (this.isMobile) {
          this.toggleLayoutLock()
        }
      })
      .catch(() => { /* modal dismissed */ })
  }

  public toggleLayoutLock() {
    this.isMobile = !this.isMobile

    if (this.isMobile) {
      const servicesBags = document.querySelectorAll('.services-bag')
      servicesBags.forEach((servicesBag) => {
        for (let i = 0; i < 10; i += 1) {
          const invisibleDiv = document.createElement('div')
          invisibleDiv.className = 'accessory-box invisible py-0 my-0'
          invisibleDiv.style.height = '0'
          servicesBag.appendChild(invisibleDiv)
        }
      })
    } else {
      const invisibleItems = document.querySelectorAll('.invisible')
      invisibleItems.forEach(item => item.remove())
    }
  }

  public openSupport() {
    this.$modal.open(AccessorySupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy() {
    this.$accessories.stop()

    // Destroy drag and drop bags
    this.orderSubscription.unsubscribe()
    this.dragulaService.destroy('rooms-bag')
    this.dragulaService.destroy('services-bag')
  }

  private async checkForPlugins() {
    try {
      const installedPlugins = await firstValueFrom(this.$api.get('/plugins'))
      this.hasPlugins = installedPlugins.length > 1 // ignore the ui plugin
    } catch (error) {
      console.error(error)
      this.hasPlugins = true
    } finally {
      this.loading = false
    }
  }

  /**
   * Update the list of available bridges from the current accessories
   */
  private updateAvailableBridges() {
    const bridges = new Set<string>()

    this.$accessories.rooms.forEach((room) => {
      room.services.forEach((service) => {
        if (service.instance?.name) {
          bridges.add(service.instance.name)
        }
      })
    })

    this.availableBridges = Array.from(bridges).sort()
  }

  /**
   * Check if a service should be displayed based on current filters
   */
  public shouldDisplayService(service: any): boolean {
    // Check hidden filter
    if (this.hideHidden && service.hidden) {
      return false
    }

    // Check bridge filter
    if (this.selectedBridge && service.instance?.name !== this.selectedBridge) {
      return false
    }

    return true
  }
}
