import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { SettingsService } from '@/app/core/settings.service'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { Component, OnDestroy, OnInit } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { DragulaService } from 'ng2-dragula'
import { ToastrService } from 'ngx-toastr'
import { Subscription } from 'rxjs'

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  public isMobile: any = false
  public hideHidden = true
  private orderSubscription: Subscription

  constructor(
    public $auth: AuthService,
    private dragulaService: DragulaService,
    public $toastr: ToastrService,
    private modalService: NgbModal,
    public $settings: SettingsService,
    private $md: MobileDetectService,
    protected $accessories: AccessoriesService,
  ) {
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
    this.modalService.open(AddRoomComponent, {
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
