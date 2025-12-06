import { Component, createEnvironmentInjector, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
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
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'

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
  private injector = inject(EnvironmentInjector)
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
    const injector = createEnvironmentInjector([{
      provide: ADD_ROOM_MODAL_DATA,
      useValue: {
        existingRooms: this.$accessories.rooms(),
      },
    }], this.injector)

    const ref = this.$modal.open(AddRoomComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result: { name: string, isDefault: boolean } = await ref.result
      // No room name provided (validation should prevent this, but safety check)
      if (!result?.name || !result.name.length) {
        return
      }

      // If setting as default, unset other default rooms
      if (result.isDefault) {
        this.$accessories.rooms.update(current => current.map(r => ({
          ...r,
          isDefault: false,
        })))
      }

      this.$accessories.rooms.update(current => [...current, {
        name: result.name,
        isDefault: result.isDefault,
        services: [],
      }])

      // Save the layout to persist the new room
      this.$accessories.saveLayout()

      if (this.isMobile()) {
        this.toggleLayoutLock()
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async editRoom(roomIndex: number): Promise<void> {
    const room = this.$accessories.rooms()[roomIndex]
    if (!room) {
      return
    }

    const injector = createEnvironmentInjector([{
      provide: EDIT_ROOM_MODAL_DATA,
      useValue: {
        roomName: room.name,
        isDefault: room.isDefault || false,
        existingRooms: this.$accessories.rooms(),
        currentRoomIndex: roomIndex,
      },
    }], this.injector)

    const ref = this.$modal.open(EditRoomComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result: { name?: string, isDefault?: boolean, delete?: boolean } = await ref.result

      // Handle delete mode
      if (result?.delete) {
        const roomToDelete = this.$accessories.rooms()[roomIndex]
        if (!roomToDelete) {
          return
        }

        // Find target room to move services to
        let targetRoomIndex: number
        if (roomToDelete.isDefault) {
          // If deleting default room, move services to first other room (which will become new default)
          targetRoomIndex = roomIndex === 0 ? 1 : 0
        } else {
          // If deleting non-default room, move services to current default room
          const defaultRoomIndex = this.$accessories.rooms().findIndex(r => r.isDefault)
          targetRoomIndex = defaultRoomIndex !== -1 ? defaultRoomIndex : 0
        }

        // If deleting the default room, set the target room as the new default
        if (roomToDelete.isDefault) {
          this.$accessories.rooms.update(current => current.map((r, idx) =>
            idx === targetRoomIndex
              ? { ...r, isDefault: true }
              : { ...r, isDefault: false },
          ))
        }

        // Move services from room being deleted to target room
        const servicesToMove = roomToDelete.services
        if (servicesToMove.length > 0) {
          this.$accessories.rooms.update(current => current.map((r, idx) =>
            idx === targetRoomIndex
              ? { ...r, services: [...r.services, ...servicesToMove] }
              : r,
          ))
        }

        // Remove the room
        this.$accessories.rooms.update(current => current.filter((_, idx) => idx !== roomIndex))

        // Save the layout to persist the changes
        this.$accessories.saveLayout()
        return
      }

      // Handle edit mode
      // No room name provided (validation should prevent this, but safety check)
      if (!result?.name || !result.name.length) {
        return
      }

      // If setting as default, unset other default rooms
      if (result.isDefault) {
        this.$accessories.rooms.update(current => current.map(r => ({
          ...r,
          isDefault: false,
        })))
      }

      // Update the room
      this.$accessories.rooms.update(current => current.map((r, idx) =>
        idx === roomIndex
          ? { ...r, name: result.name, isDefault: result.isDefault }
          : r,
      ))

      // Save the layout to persist the changes
      this.$accessories.saveLayout()
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
