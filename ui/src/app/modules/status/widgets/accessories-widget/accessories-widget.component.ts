import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { TranslatePipe } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

@Component({
  selector: 'app-accessories-widget',
  imports: [
    DragulaModule,
    AccessoryTileComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './accessories-widget.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesWidgetComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private destroyRef = inject(DestroyRef)
  private $accessories = inject(AccessoriesService)
  private $dragula = inject(DragulaService)
  private $md = inject(MobileDetectService)

  // Signals
  readonly widget = input.required<Widget>()
  public readonly dashboardAccessories = signal<ServiceTypeX[]>([])
  public readonly loaded = signal<boolean>(false)
  public readonly isMobile = signal(false)

  constructor() {
    const $dragula = this.$dragula

    this.isMobile.set(!!this.$md.detect.mobile())

    // Disable drag and drop for the .no-drag class
    $dragula.createGroup('widget-accessories-bag', {
      moves: el => !this.isMobile() && !el!.classList.contains('no-drag'),
    })

    // Save the room and service layout
    $dragula.drop()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.widget().accessoryOrder = this.dashboardAccessories().map(x => x.uniqueId) as string[]
        this.widget().$saveWidgetsEvent.next(undefined)
      })
  }

  public ngOnInit(): void {
    void this.initialize()
  }

  private async initialize(): Promise<void> {
    // Subscribe to accessory data events
    this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.getDashboardAccessories()
    })

    // Start the accessory service
    await this.$accessories.start()

    // Subscribe to layout events
    this.$accessories.layoutSaved.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.getDashboardAccessories()
      },
    })
  }

  public ngOnDestroy(): void {
    this.$accessories.stop()
    this.$dragula.destroy('widget-accessories-bag')
  }

  private getDashboardAccessories(): void {
    const dashboardAccessories = []

    for (const room of this.$accessories.rooms()) {
      for (const accessory of room.services) {
        if (accessory.onDashboard) {
          dashboardAccessories.push(accessory)
        }
      }
    }

    if (this.widget().accessoryOrder && this.widget().accessoryOrder!.length) {
      dashboardAccessories.sort((a, b) => {
        const posA = this.widget().accessoryOrder!.findIndex((s: any) => s === a.uniqueId)
        const posB = this.widget().accessoryOrder!.findIndex((s: any) => s === b.uniqueId)
        if (posA < posB) {
          return -1
        } else if (posA > posB) {
          return 1
        }
        return 0
      })
    }

    this.dashboardAccessories.set(dashboardAccessories)
    this.loaded.set(true)
  }
}
