import { Injectable } from '@angular/core';
import { ServiceType } from '@oznu/hap-client';
import { ToastrService } from 'ngx-toastr';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Subject } from 'rxjs';

import { WsService, IoNamespace } from '../ws.service';
import { AuthService } from '../auth/auth.service';
import { ApiService } from '../api.service';
import { ServiceTypeX } from './accessories.interfaces';
import { InfoModalComponent } from './info-modal/info-modal.component';

@Injectable({
  providedIn: 'root',
})
export class AccessoriesService {
  private io: IoNamespace;

  public layoutSaved = new Subject();
  public accessoryData = new Subject();

  public accessoryLayout: {
    name: string; services: Array<{
      aid: number;
      iid: number;
      uuid: string;
      uniqueId: string;
      hidden?: boolean,
      onDashboard?: boolean
    }>;
  }[];
  public accessories: { services: ServiceType[] } = { services: [] };
  public rooms: Array<{ name: string, services: ServiceTypeX[] }> = [];
  private roomsOrdered = false;

  private hiddenTypes = [
    'InputSource',
    'CameraRTPStreamManagement',
    'ProtocolInformation',
  ];

  constructor(
    private modalService: NgbModal,
    public $toastr: ToastrService,
    private $ws: WsService,
    public $auth: AuthService,
    private $api: ApiService,
  ) { }

  /**
   * Start the accessory control session
   */
  public async start() {
    // connect to the socket endpoint
    this.io = this.$ws.connectToNamespace('accessories');

    // load the room layout first
    await this.loadLayout();

    // start accessory subscription
    if (this.io.connected) {
      this.io.socket.emit('get-accessories');
      setTimeout(() => {
        this.io.connected.subscribe(() => {
          this.io.socket.emit('get-accessories');
        });
      }, 1000);
    } else {
      this.io.connected.subscribe(() => {
        this.io.socket.emit('get-accessories');
      });
    }

    // subscribe to accessory events
    this.io.socket.on('accessories-data', (data) => {
      this.parseServices(data);
      this.generateHelpers();
      this.sortIntoRooms();

      if (!this.roomsOrdered) {
        this.orderRooms();
        this.applyCustomAttributes();
        this.roomsOrdered = true;
      }

      this.accessoryData.next(data);
    });

    // when a new instance is available, do a self reload
    this.io.socket.on('accessories-reload-required', async () => {
      await this.stop();
      await this.start();
    });

    this.io.socket.on('accessory-control-failure', (message) => {
      this.$toastr.error(message);
    });
  }

  /**
   * Load the room layout
   */
  private async loadLayout() {
    this.accessoryLayout = await this.io.request('get-layout', { user: this.$auth.user.username }).toPromise();

    // build empty room layout
    this.rooms = this.accessoryLayout.map((room) => {
      return {
        name: room.name,
        services: [],
      };
    });
  }

  /**
   * Parse the incoming accessory data and refresh existing accessory statuses
   */
  private parseServices(services) {
    if (!this.accessories.services.length) {
      this.accessories.services = services;
      return;
    }

    // update the existing objects to avoid re-painting the dom element each refresh
    services.forEach((service) => {
      const existing = this.accessories.services.find(x => x.uniqueId === service.uniqueId);

      if (existing) {
        Object.assign(existing, service);
      } else {
        this.accessories.services.push(service);
      }
    });
  }

  /**
   * Sort the accessories into their rooms
   */
  private sortIntoRooms() {
    this.accessories.services.forEach((service) => {
      // don't put hidden types into rooms
      if (this.hiddenTypes.includes(service.type)) {
        return;
      }

      // link services
      if (service.linked) {
        service.linkedServices = {};
        service.linked.forEach((iid) => {
          service.linkedServices[iid] = this.accessories.services.find(s => s.aid === service.aid && s.iid === iid
            && s.instance.username === service.instance.username);
        });
      }

      // check if the service has already been allocated to an active room
      const inRoom = this.rooms.find(r => {
        if (r.services.find(s => s.uniqueId === service.uniqueId)) {
          return true;
        }
      });

      // not in an active room, perhaps the service is in the layout cache
      if (!inRoom) {
        const inCache = this.accessoryLayout.find(r => {
          if (r.services.find(s => s.uniqueId === service.uniqueId)) {
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
              services: [service],
            });
          }
        }
      }
    });
  }

  /**
   * Order the rooms on the screen
   */
  private orderRooms() {
    // order the services within each room
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name);
      room.services.sort((a, b) => {
        const posA = roomCache.services.findIndex(s => s.uniqueId === a.uniqueId);
        const posB = roomCache.services.findIndex(s => s.uniqueId === b.uniqueId);
        if (posA < posB) {
          return -1;
        } else if (posA > posB) {
          return 1;
        }
        return 0;
      });
    });
  }

  /**
   * Setup custom attributes
   */
  private applyCustomAttributes() {
    // apply custom saved attributes to the service
    this.rooms.forEach((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name);
      room.services.forEach((service) => {
        const serviceCache = roomCache.services.find(s => s.uniqueId === service.uniqueId);
        Object.assign(service, serviceCache);
      });
    });
  }

  /**
   * Save the room layout
   */
  public saveLayout() {
    // generate layout schema to save to disk
    this.accessoryLayout = this.rooms.map((room) => {
      return {
        name: room.name,
        services: room.services.map((service) => {
          return {
            uniqueId: service.uniqueId,
            aid: service.aid,
            iid: service.iid,
            uuid: service.uuid,
            customName: service.customName || undefined,
            hidden: service.hidden || undefined,
            onDashboard: service.onDashboard || undefined,
          };
        }),
      };
    }).filter(room => room.services.length);

    // send update request to server
    this.io.request('save-layout', { user: this.$auth.user.username, layout: this.accessoryLayout })
      .subscribe(
        data => this.layoutSaved.next(),
        err => this.$toastr.error(err.message, 'Failed to save page layout'),
      );
  }

  /**
   * Generate helpers for accessory control
   */
  private generateHelpers() {
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
                  uniqueId: service.uniqueId,
                  aid: service.aid,
                  siid: service.iid,
                  iid: characteristic.iid,
                  value: value,
                },
              });
              return resolve();
            });
          };

          return characteristic;
        };
      }
    });
  }

  /**
   *
   */
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

  /**
   * Stop the accessory control session
   */
  public stop() {
    this.io.end();
    this.rooms = [];
    this.accessories = { services: [] };
    this.roomsOrdered = false;
    delete this.accessoryLayout;
  }

}
