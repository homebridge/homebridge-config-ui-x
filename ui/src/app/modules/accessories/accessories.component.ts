import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { SettingsService } from '@/app/core/ui/settings.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
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
    DragulaModule,
    AccessoryTileComponent,
    DragHerePlaceholderComponent,
    TranslatePipe,
    SpinnerComponent,
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

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  public isMobile = signal<boolean | string>(false)
  public hideHidden = signal(true)
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public hasPlugins = signal(false)
  public loading = signal(true)

  // Getter/setter for dragula two-way binding
  public get rooms() {
    return this.$accessories.rooms()
  }

  public set rooms(value) {
    this.$accessories.rooms.set(value)
  }

  constructor() {
    const dragulaService = this.dragulaService

    this.isMobile.set(this.$md.detect.mobile())

    // Disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => !this.isMobile() && handle.classList.contains('drag-handle'),
    })

    // Disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: el => !this.isMobile() && !el.classList.contains('no-drag'),
    })

    // Save the room and service layout
    dragulaService.drop()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        setTimeout(() => {
          this.$accessories.saveLayout()
        })
      })

    this.isMobile.set(true)
  }

  public ngOnInit() {
    // Set page title
    const title = this.$translate.instant('menu.label_accessories')
    this.$settings.setPageTitle(title)

    void this.$accessories.start()
    void this.checkForPlugins()
  }

  public async addRoom(): Promise<void> {
    const ref = this.$modal.open(AddRoomComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    try {
      const roomName: string = await ref.result
      // No room name provided
      if (!roomName || !roomName.length) {
        return
      }

      // Duplicate room name
      if (this.$accessories.rooms().find(r => r.name === roomName)) {
        return
      }

      this.$accessories.rooms.update(current => [...current, {
        name: roomName,
        services: [],
      }])

      if (this.isMobile()) {
        this.toggleLayoutLock()
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public toggleLayoutLock() {
    this.isMobile.set(!this.isMobile())

    if (this.isMobile()) {
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
    this.dragulaService.destroy('rooms-bag')
    this.dragulaService.destroy('services-bag')
  }

  private async checkForPlugins() {
    try {
      const installedPlugins = await this.$api.get('/plugins')
      this.hasPlugins.set(installedPlugins.length > 1) // ignore the ui plugin
    } catch (error) {
      console.error(error)
      this.hasPlugins.set(true)
    } finally {
      this.loading.set(false)
    }
  }
}
