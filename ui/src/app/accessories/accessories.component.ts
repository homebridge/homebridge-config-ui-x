import { Component, OnInit, Input } from '@angular/core';

import { StateService } from '@uirouter/angular';
import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ServiceType } from '@oznu/hap-client';
import { DragulaService } from 'ng2-dragula';
import * as MobileDetect from 'mobile-detect';

import { WsService } from '../_services/ws.service';
import { ApiService } from '../_services/api.service';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss']
})
export class AccessoriesComponent implements OnInit {
  @Input() accessoryLayout: { name: string; services: Array<{ aid: number; iid: number; uuid: string; }>; }[];
  public accessories: { services: ServiceType[] } = { services: [] };
  public rooms: Array<{ name: string, services: ServiceType[] }> = [];
  public isMobile: any = false;
  private roomsOrdered = false;
  private onOpen;
  private onMessage;

  constructor(
    private dragulaService: DragulaService,
    public toastr: ToastsManager,
    private modalService: NgbModal,
    private ws: WsService,
    private $api: ApiService
  ) {
    const md = new MobileDetect(window.navigator.userAgent);
    this.isMobile = md.mobile();

    // disable drag and drop for everything except the room title
    dragulaService.setOptions('rooms-bag', {
      moves: (el, container, handle) => !this.isMobile && handle.classList.contains('drag-handle')
    });

    // disable drag and drop for the .no-drag class
    dragulaService.setOptions('services-bag', {
      moves: (el, source, handle, sibling) => !this.isMobile && !el.classList.contains('no-drag')
    });

    // save the room and service layout
    dragulaService.drop.subscribe(() => {
      setTimeout(() => {
        this.saveLayout();
      });
    });
  }

  ngOnInit() {
    // build empty room layout
    this.rooms = this.accessoryLayout.map((room) => {
      return {
        name: room.name,
        services: [],
      };
    });

    // subscribe to status events
    if (this.ws.socket.readyState) {
      this.ws.subscribe('accessories');
    }

    this.onOpen = this.ws.open.subscribe(() => {
      this.ws.subscribe('accessories');
    });

    this.onMessage = this.ws.message.subscribe((data) => {
      try {
        data = JSON.parse(data.data);
        if (data.accessories) {
          if (data.accessories.services) {
            this.parseServices(data.accessories.services);
            this.generateHelpers();
            this.sortIntoRooms();

            if (!this.roomsOrdered) {
              this.orderRooms();
            }
          }
        }
      } catch (e) { }
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
            uuid: service.uuid
          };
        })
      };
    })
    .filter(room => room.services.length);

    // send update request to server
    this.$api.updateAccessoryLayout(this.accessoryLayout)
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
              this.ws.send({
                accessories: {
                  set: {
                    aid: service.aid,
                    siid: service.iid,
                    iid: characteristic.iid,
                    value: value
                  }
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

  // tslint:disable-next-line:use-life-cycle-interface
  ngOnDestroy() {
    try {
      // unsubscribe from log events
      this.ws.unsubscribe('accessories');

      // unsubscribe listeners
      this.onOpen.unsubscribe();
      this.onMessage.unsubscribe();
    } catch (e) { }

    // destroy drag and drop bags
    this.dragulaService.destroy('rooms-bag');
    this.dragulaService.destroy('services-bag');
  }

}

export function accessoriesStateResolve($api, toastr, $state) {
  return $api.getAccessoryLayout().toPromise().catch((err) => {
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
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: accessoriesStateResolve
  }],
  data: {
    requiresAuth: true
  }
};
