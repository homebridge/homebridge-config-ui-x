import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { MobileDetectService } from '@/app/core/mobile-detect.service'
import { NgClass, NgFor, NgIf, NgSwitch } from '@angular/common'
import { Component, inject, Input, OnDestroy, OnInit } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { Subscription } from 'rxjs'
import { AccessoryTileComponent } from '../../../../core/accessories/accessory-tile/accessory-tile.component'

@Component({
  templateUrl: './accessories-widget.component.html',
  imports: [
    NgClass,
    NgIf,
    DragulaModule,
    NgFor,
    NgSwitch,
    AccessoryTileComponent,
    TranslatePipe,
  ],
})
export class AccessoriesWidgetComponent implements OnInit, OnDestroy {
  private $accessories = inject(AccessoriesService)
  private $dragula = inject(DragulaService)
  private $md = inject(MobileDetectService)

  @Input() widget: any

  public isMobile: any = false

  public dashboardAccessories: ServiceTypeX[] = []
  public loaded = false
  private accessoryDataSubscription: Subscription
  private layoutSubscription: Subscription
  private orderSubscription: Subscription

  constructor() {
    const $dragula = this.$dragula

    this.isMobile = this.$md.detect.mobile()

    // disable drag and drop for the .no-drag class
    $dragula.createGroup('widget-accessories-bag', {
      moves: el => !this.isMobile && !el.classList.contains('no-drag'),
    })

    // save the room and service layout
    this.orderSubscription = $dragula.drop().subscribe(() => {
      setTimeout(() => {
        this.widget.accessoryOrder = this.dashboardAccessories.map(x => x.uniqueId)
        this.widget.$saveWidgetsEvent.next(undefined)
      })
    })
  }

  async ngOnInit() {
    // subscribe to accessory data events
    this.accessoryDataSubscription = this.$accessories.accessoryData.subscribe(() => {
      this.getDashboardAccessories()
    })

    // start the accessory service
    await this.$accessories.start()

    // subscribe to layout events
    this.layoutSubscription = this.$accessories.layoutSaved.subscribe({
      next: () => {
        this.getDashboardAccessories()
      },
    })
  }

  getDashboardAccessories() {
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

  ngOnDestroy() {
    this.$accessories.stop()
    this.layoutSubscription.unsubscribe()
    this.orderSubscription.unsubscribe()
    this.accessoryDataSubscription.unsubscribe()
    this.$dragula.destroy('widget-accessories-bag')
  }
}
