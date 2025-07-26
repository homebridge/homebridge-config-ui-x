import { NgClass } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { Subscription } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  templateUrl: './accessories-widget.component.html',
  standalone: true,
  imports: [
    NgClass,
    DragulaModule,
    AccessoryTileComponent,
    TranslatePipe,
  ],
})
export class AccessoriesWidgetComponent implements OnInit, OnDestroy {
  private $accessories = inject(AccessoriesService)
  private $dragula = inject(DragulaService)
  private $md = inject(MobileDetectService)
  private accessoryDataSubscription: Subscription
  private layoutSubscription: Subscription
  private orderSubscription: Subscription

  @Input() widget: Widget

  public isMobile: any = false
  public dashboardAccessories: ServiceTypeX[] = []
  public loaded = false

  constructor() {
    const $dragula = this.$dragula

    this.isMobile = this.$md.detect.mobile()

    // Disable drag and drop for the .no-drag class
    $dragula.createGroup('widget-accessories-bag', {
      moves: el => !this.isMobile && !el.classList.contains('no-drag'),
    })

    // Save the room and service layout
    this.orderSubscription = $dragula.drop().subscribe(() => {
      setTimeout(() => {
        this.widget.accessoryOrder = this.dashboardAccessories.map(x => x.uniqueId)
        this.widget.$saveWidgetsEvent.next(undefined)
      })
    })
  }

  public async ngOnInit() {
    // Subscribe to accessory data events
    this.accessoryDataSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.getDashboardAccessories()
    })

    // Start the accessory service
    await this.$accessories.start()

    // Subscribe to layout events
    this.layoutSubscription = this.$accessories.layoutSaved.subscribe({
      next: () => {
        this.getDashboardAccessories()
      },
    })
  }

  public ngOnDestroy() {
    this.$accessories.stop()
    this.layoutSubscription.unsubscribe()
    this.orderSubscription.unsubscribe()
    this.accessoryDataSubscription.unsubscribe()
    this.$dragula.destroy('widget-accessories-bag')
  }

  private getDashboardAccessories() {
    const dashboardAccessories = []

    for (const room of this.$accessories.rooms) {
      for (const accessory of room.services) {
        if (accessory.onDashboard) {
          dashboardAccessories.push(accessory)
        }
      }
    }

    if (this.widget.accessoryOrder && this.widget.accessoryOrder.length) {
      dashboardAccessories.sort((a, b) => {
        const posA = this.widget.accessoryOrder.findIndex((s: any) => s === a.uniqueId)
        const posB = this.widget.accessoryOrder.findIndex((s: any) => s === b.uniqueId)
        if (posA < posB) {
          return -1
        } else if (posA > posB) {
          return 1
        }
        return 0
      })
    }

    this.dashboardAccessories = dashboardAccessories
    this.loaded = true
  }
}
