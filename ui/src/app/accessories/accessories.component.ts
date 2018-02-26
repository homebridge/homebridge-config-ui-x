import { Component, OnInit } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';
import { WsService } from '../_services/ws.service';

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss']
})
export class AccessoriesComponent implements OnInit {
  private onOpen;
  private onMessage;
  private onClose;
  public accessories: { services: ServiceType[] } = { services: [] };

  constructor(
    private ws: WsService,
  ) { }

  ngOnInit() {
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
          }
        }
      } catch (e) { }
    });
  }

  parseServices(services) {
    if (!this.accessories.services) {
      this.accessories.services = services;
      return this.generateHelpers();
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

    return this.generateHelpers();
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
      // this.onClose.unsubscribe();
      this.onMessage.unsubscribe();
    } catch (e) { }
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
