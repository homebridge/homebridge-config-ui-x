import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AccessoriesService } from '../../../../core/accessories/accessories.service';

@Component({
  selector: 'app-accessories-widget',
  templateUrl: './accessories-widget.component.html',
  styleUrls: ['./accessories-widget.component.scss'],
})
export class AccessoriesWidgetComponent implements OnInit, OnDestroy {
  public dashboardAccessories = [];
  public loaded = false;
  public layoutSubscription: Subscription;

  constructor(
    public $accessories: AccessoriesService,
  ) { }

  async ngOnInit() {
    await this.$accessories.start();

    // subscribe to accessory events
    this.$accessories.io.socket.on('accessories-data', () => {
      this.getDashboardAccessories();
    });

    this.layoutSubscription = this.$accessories.layoutSaved.subscribe({
      next: () => {
        this.getDashboardAccessories();
      },
    });
  }

  getDashboardAccessories() {
    const dashboardAccessories = [];

    for (const room of this.$accessories.rooms) {
      for (const accessory of room.services) {
        if (accessory.onDashboard) {
          dashboardAccessories.push(accessory);
        }
      }
    }

    this.dashboardAccessories = dashboardAccessories;
    this.loaded = true;
  }

  ngOnDestroy() {
    this.$accessories.stop();
    this.layoutSubscription.unsubscribe();
  }

}
