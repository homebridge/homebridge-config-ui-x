import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { NgClass, NgFor, NgIf, NgSwitch } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { NgbModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { Subscription } from 'rxjs'
import { AccessoryTileComponent } from '../../core/accessories/accessory-tile/accessory-tile.component'
import { DragHerePlaceholderComponent } from './drag-here-placeholder/drag-here-placeholder.component'

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
  imports: [
    NgIf,
    NgbTooltip,
    NgClass,
    DragulaModule,
    NgFor,
    NgSwitch,
    AccessoryTileComponent,
    DragHerePlaceholderComponent,
    TranslatePipe,
  ],
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private $modal = inject(NgbModal)
  $settings = inject(SettingsService)
  private $md = inject(MobileDetectService)
  protected $accessories = inject(AccessoriesService)

  public isMobile: any = false
  public hideHidden = true
  private orderSubscription: Subscription

  constructor() {
    const dragulaService = this.dragulaService

    this.isMobile = this.$md.detect.mobile()

    // disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => !this.isMobile && handle.classList.contains('drag-handle'),
    })

    // disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: el => !this.isMobile && !el.classList.contains('no-drag'),
    })

    // save the room and service layout
    this.orderSubscription = dragulaService.drop().subscribe(() => {
      setTimeout(() => {
        this.$accessories.saveLayout()
      })
    })

    // check to see if the layout should be locked
    if (window.localStorage.getItem('accessories-layout-locked')) {
      this.isMobile = true
    }
  }

  ngOnInit() {
    this.$accessories.start()
  }

  addRoom() {
    this.$modal.open(AddRoomComponent, {
      size: 'lg',
      backdrop: 'static',
    }).result.then((roomName) => {
      // no room name provided
      if (!roomName || !roomName.length) {
        return
      }

      // duplicate room name
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
    }).catch(() => { /* modal dismissed */ })
  }

  toggleLayoutLock() {
    this.isMobile = !this.isMobile

    if (this.isMobile) {
      // layout locked
      window.localStorage.setItem('accessories-layout-locked', 'yes')
    } else {
      // layout unlocked
      window.localStorage.removeItem('accessories-layout-locked')
    }
  }

  ngOnDestroy() {
    this.$accessories.stop()

    // destroy drag and drop bags
    this.orderSubscription.unsubscribe()
    this.dragulaService.destroy('rooms-bag')
    this.dragulaService.destroy('services-bag')
  }
}
