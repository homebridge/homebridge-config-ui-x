import { Component, OnInit, OnDestroy } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { DragulaService } from 'ng2-dragula';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { AccessoriesService } from '../../core//accessories/accessories.service';
import { MobileDetectService } from '../../core/mobile-detect.service';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  public isMobile: any = false;
  public hideHidden = true;
  private orderSubscription: Subscription;

  constructor(
    private dragulaService: DragulaService,
    public $toastr: ToastrService,
    private modalService: NgbModal,
    public $auth: AuthService,
    private $md: MobileDetectService,
    private translate: TranslateService,
    private $accessories: AccessoriesService,
  ) {
    this.isMobile = this.$md.detect.mobile();

    // disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (el, container, handle) => !this.isMobile && handle.classList.contains('drag-handle'),
    });

    // disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: (el, source, handle, sibling) => !this.isMobile && !el.classList.contains('no-drag'),
    });

    // save the room and service layout
    this.orderSubscription = dragulaService.drop().subscribe(() => {
      setTimeout(() => {
        this.$accessories.saveLayout();
      });
    });

    // check to see if the layout should be locked
    if (window.localStorage.getItem('accessories-layout-locked')) {
      this.isMobile = true;
    }
  }

  ngOnInit() {
    this.$accessories.start();
  }

  addRoom() {
    const ref = this.modalService.open(AddRoomModalComponent, {
      size: 'lg',
    }).result.then((roomName) => {
      // no room name provided
      if (!roomName || !roomName.length) {
        return;
      }

      // duplicate room name
      if (this.$accessories.rooms.find(r => r.name === roomName)) {
        return;
      }

      this.$accessories.rooms.push({
        name: roomName,
        services: [],
      });

      if (this.isMobile) {
        this.toggleLayoutLock();
      }
    })
      .catch(() => { /* modal dismissed */ });
  }

  toggleLayoutLock() {
    this.isMobile = !this.isMobile;

    if (this.isMobile) {
      // layout locked
      window.localStorage.setItem('accessories-layout-locked', 'yes');
      this.$toastr.success(this.translate.instant('accessories.layout_locked'), this.translate.instant('accessories.title_accessories'));
    } else {
      // layout unlocked
      window.localStorage.removeItem('accessories-layout-locked');
      this.$toastr.success(this.translate.instant('accessories.layout_unlocked'), this.translate.instant('accessories.title_accessories'));
    }
  }

  ngOnDestroy() {
    this.$accessories.stop();

    // destroy drag and drop bags
    this.orderSubscription.unsubscribe();
    this.dragulaService.destroy('rooms-bag');
    this.dragulaService.destroy('services-bag');
  }

}
