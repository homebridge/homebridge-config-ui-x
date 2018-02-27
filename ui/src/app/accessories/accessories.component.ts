import { Component, OnInit } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';
import { DragulaService } from 'ng2-dragula';
import * as MobileDetect from 'mobile-detect';

import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss']
})
export class AccessoriesComponent implements OnInit {
  private onOpen;
  private onMessage;
  public isMobile: any = false;
  public accessories: { services: ServiceType[] } = { services: [] };
  public rooms: Array<{ name: string, services: ServiceType[] }>;

  constructor(
    private dragulaService: DragulaService,
    private ws: WsService,
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
    dragulaService.drop.subscribe((value) => {
      console.log('TODO: Save Room and Service Layout');
    });
  }

  ngOnInit() {
    // placeholder rooms - these need to be loaded from the server
    this.rooms = [
      {
        name: 'Default Room',
        services: []
      },
      {
        name: 'Lounge Room',
        services: []
      },
      {
        name: 'Bedroom',
        services: []
      }
    ];

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
            this.sortRooms();
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

  sortRooms() {
    this.accessories.services.forEach((service) => {
      const inRoom = this.rooms.find(r => {
        if (r.services.find(s => s.aid === service.aid && s.iid === service.iid && s.uuid === service.uuid)) {
          return true;
        }
      });

      if (!inRoom) {
        this.rooms.find(r => r.name === 'Default Room').services.push(service);
      }
    });
  }

  addRoom() {
    // TODO - Add room modal
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

export const AccessoriesStates = {
  name: 'accessories',
  url: '/accessories',
  component: AccessoriesComponent,
  data: {
    requiresAuth: true
  }
};
