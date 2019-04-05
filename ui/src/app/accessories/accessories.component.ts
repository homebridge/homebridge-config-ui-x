import { Component, OnInit, Input, OnDestroy } from '@angular/core';

import { StateService } from '@uirouter/angular';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceType } from '@oznu/hap-client';
import { DragulaService } from 'ng2-dragula';

import { WsService } from '../_services/ws.service';
import { AuthService } from '../_services/auth.service';
import { ApiService } from '../_services/api.service';
import { MobileDetectService } from '../_services/mobile-detect.service';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';
import { InfoModalComponent } from './info-modal/info-modal.component';

export type ServiceTypeX = ServiceType & { customName?: string, hidden?: boolean };

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss']
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  private io = this.$ws.connectToNamespace('accessories');

  @Input() accessoryLayout: { name: string; services: Array<{ aid: number; iid: number; uuid: string; }>; }[];
  public accessories: { services: ServiceType[] } = { services: [] };
  public rooms: Array<{ name: string, services: ServiceTypeX[] }> = [];
  public isMobile: any = false;
  public hideHidden = true;
  private roomsOrdered = false;
  private onOpen;
  private onMessage;

  constructor(
    private dragulaService: DragulaService,
    public toastr: ToastrService,
    private modalService: NgbModal,
    private $ws: WsService,
    public $auth: AuthService,
    private $api: ApiService,
    private $md: MobileDetectService,
    private translate: TranslateService,
  ) {
    this.isMobile = this.$md.detect.mobile();

    // disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (el, container, handle) => !this.isMobile && handle.classList.contains('drag-handle')
    });

    // disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: (el, source, handle, sibling) => !this.isMobile && !el.classList.contains('no-drag')
    });

    // save the room and service layout
    dragulaService.drop().subscribe(() => {
      setTimeout(() => {
        this.saveLayout();
      });
    });

    // check to see if the layout should be locked
    if (window.localStorage.getItem('accessories-layout-locked')) {
      this.isMobile = true;
    }
  }

  ngOnInit() {
    // build empty room layout
    this.rooms = this.accessoryLayout.map((room) => {
      return {
        name: room.name,
        services: [],
      };
    });

    this.io.socket.on('connect', () => {
      this.io.socket.emit('get-accessories');
    });

    this.io.socket.on('accessories-data', (data) => {
      this.parseServices(data);
      this.generateHelpers();
      this.sortIntoRooms();

      if (!this.roomsOrdered) {
        this.orderRooms();
        this.applyCustomAttributes();
        this.roomsOrdered = true;
      }
    });
  }

  parseServices(services) {
    if (!this.accessories.services.length) {
      this.accessories.services = services;
      return;
    }

    // update the existing objects to avoid re-painting the dom element each refresh
    services.forEach((service) => {
      const existing = this.accessories.services.find(x => x.aid === service.aid && x.iid === service.iid && x.uuid === service.uuid);

      if (existing) {
        Object.assign(existing, service);
      } else {
        this.accessories.services.push(service);
      }
    });
  }

  sortIntoRooms() {
    this.accessories.services.forEach((service) => {
      // check if the service has already been allocated to an active room
      const inRoom = this.rooms.find(r => {
        if (r.services.find(s => s.aid === service.aid && s.iid === service.iid && s.uuid === service.uuid)) {
          return true;
        }
      });

      // not in an active room, perhaps the service is in the layout cache
      if (!inRoom) {
        const inCache = this.accessoryLayout.find(r => {
          if (r.services.find(s => s.aid === service.aid && s.iid === service.iid && s.uuid === service.uuid)) {
            return true;
          }
        });

        if (inCache) {
          // it's in the cache, add to the correct room
          this.rooms.find(r => r.name === inCache.name).services.push(service);
        } else {
          // new accessory add the default room
          const defaultRoom = this.rooms.find(r => r.name === 'Default Room');

          // does the default room exist?
          if (defaultRoom) {
            defaultRoom.services.push(service);
          } else {
            this.rooms.push({
              name: 'Default Room',
              services: [service]
            });
          }
        }
      }
    });
  }

  orderRooms() {
    // order the services within each room
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name);
      room.services.sort((a, b) => {
        const posA = roomCache.services.findIndex(s => s.aid === a.aid && s.iid === a.iid && s.uuid === a.uuid);
        const posB = roomCache.services.findIndex(s => s.aid === b.aid && s.iid === b.iid && s.uuid === b.uuid);
        if (posA < posB) {
          return -1;
        } else if (posA > posB) {
          return 1;
        }
        return 0;
      });
    });
  }

  applyCustomAttributes() {
    // apply custom saved attributes to the service
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name);
      room.services.forEach((service) => {
        const serviceCache = roomCache.services.find(s => s.aid === service.aid && s.iid === service.iid && s.uuid === service.uuid);
        Object.assign(service, serviceCache);
      });
    });
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
      if (this.rooms.find(r => r.name === roomName)) {
        return;
      }

      this.rooms.push({
        name: roomName,
        services: []
      });
    })
      .catch(() => { /* modal dismissed */ });
  }

  saveLayout() {
    // generate layout schema to save to disk
    this.accessoryLayout = this.rooms.map((room) => {
      return {
        name: room.name,
        services: room.services.map((service) => {
          return {
            aid: service.aid,
            iid: service.iid,
            uuid: service.uuid,
            customName: service.customName || undefined,
            hidden: service.hidden || undefined
          };
        })
      };
    })
      .filter(room => room.services.length);

    // send update request to server
    this.$api.post('/accessories', this.accessoryLayout)
      .subscribe(
        data => true,
        err => this.toastr.error(err.message, 'Failed to save page layout')
      );
  }

  generateHelpers() {
    this.accessories.services.forEach((service) => {
      if (!service.getCharacteristic) {
        service.getCharacteristic = (type: string) => {

          const characteristic = service.serviceCharacteristics.find(x => x.type === type);

          if (!characteristic) {
            return null;
          }

          characteristic.setValue = (value: number | string | boolean) => {
            return new Promise((resolve, reject) => {
              this.io.socket.emit('accessory-control', {
                set: {
                  aid: service.aid,
                  siid: service.iid,
                  iid: characteristic.iid,
                  value: value
                }
              });
              return resolve();
            });
          };

          return characteristic;
        };
      }
    });
  }

  showAccessoryInformation(service) {
    const ref = this.modalService.open(InfoModalComponent, {
      size: 'lg',
    });

    ref.componentInstance.service = service;

    ref.result
      .then(x => this.saveLayout())
      .catch(x => this.saveLayout());

    return false;
  }

  toggleLayoutLock() {
    this.isMobile = !this.isMobile;

    if (this.isMobile) {
      // layout locked
      window.localStorage.setItem('accessories-layout-locked', 'yes');
      this.toastr.success(this.translate.instant('accessories.layout_locked'), this.translate.instant('accessories.title_accessories'));
    } else {
      // layout unlocked
      window.localStorage.removeItem('accessories-layout-locked');
      this.toastr.success(this.translate.instant('accessories.layout_unlocked'), this.translate.instant('accessories.title_accessories'));
    }
  }

  ngOnDestroy() {
    this.io.socket.disconnect();
    this.io.socket.removeAllListeners();

    // destroy drag and drop bags
    this.dragulaService.destroy('rooms-bag');
    this.dragulaService.destroy('services-bag');
  }

}

export function accessoriesStateResolve($api, toastr, $state) {
  return $api.get('/accessories').toPromise().catch((err) => {
    toastr.error(err.message, 'Failed to Load Accessories');
    $state.go('status');
  });
}

export const AccessoriesStates = {
  name: 'accessories',
  url: '/accessories',
  component: AccessoriesComponent,
  resolve: [{
    token: 'accessoryLayout',
    deps: [ApiService, ToastrService, StateService],
    resolveFn: accessoriesStateResolve
  }],
  data: {
    requiresAuth: true
  }
};
