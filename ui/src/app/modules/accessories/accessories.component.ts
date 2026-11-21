import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop'
import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { ToastrService } from 'ngx-toastr'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { AccessoryFilterState, AccessoryGroup, FLOOR_OTHER_KEY, groupAndSort, isFilterActive } from '@/app/core/accessories/filters/accessory-filters'
import { RoomSummary, summarizeRoom } from '@/app/core/accessories/filters/room-summary'
import { serviceBridgeName } from '@/app/core/accessories/filters/service-helpers'
import { AuthService } from '@/app/core/auth/auth.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { SettingsService } from '@/app/core/ui/settings.service'
import { AccessoriesToolbarComponent } from '@/app/modules/accessories/accessories-toolbar/accessories-toolbar.component'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'

/** localStorage key for the collapsed group ids */
const COLLAPSED_STORAGE_KEY = 'accessories-collapsed-v1'

/**
 * How manage-layout mode lets the user move things, from the view the user chose:
 * - dragula: room groups in layout order with no filter, dragged with dragula
 * - filtered: room groups in layout order with a filter, dragged with CDK by uniqueId
 * - sorted: rooms grouped, sorted by something else, so tiles move between rooms only
 * - ungrouped: grouped by category, bridge, floor or nothing, so tiles cannot move
 * - off: manage-layout mode is off
 */
export type ManageView = 'dragula' | 'filtered' | 'sorted' | 'ungrouped' | 'off'

@Component({
  selector: 'app-accessories',
  imports: [
    NgTemplateOutlet,
    NgbTooltip,
    DragulaModule,
    AccessoryTileComponent,
    AccessoriesToolbarComponent,
    ConvertTempPipe,
    DragHerePlaceholderComponent,
    TranslatePipe,
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CdkDropListGroup,
  ],
  standalone: true,
  templateUrl: './accessories.component.html',
  styleUrl: './accessories.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  protected $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)
  /** Injected so the tablets' accessories follow the layout and labels while this page is open */
  public readonly $kioskDevices = inject(KioskDevicesService)

  private destroyRef = inject(DestroyRef)
  private $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private injector = inject(EnvironmentInjector)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  // The room/tile layout starts locked; toggleLayoutLock opens it for editing
  public readonly layoutLocked = signal<boolean>(true)
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly hasPlugins = signal(this.$settings.env.hasInstalledPlugins ?? true)
  public manageLayoutMode = false

  // Signal references for persisted properties from service (persist across navigation)
  public readonly availableBridges = this.$accessories.availableBridges
  public readonly filter = this.$accessories.filterState
  public readonly collapsed = signal<ReadonlySet<string>>(this.loadCollapsed())
  public readonly placeholders = Array.from({ length: 10 })
  private $toastr = inject(ToastrService)

  public readonly batteryIndex = computed(() =>
    buildBatteryIndex(this.$accessories.rooms().flatMap(room => room.services)),
  )

  /** The accessories to show, filtered, grouped and sorted */
  public readonly groups = computed<AccessoryGroup[]>(() =>
    groupAndSort(this.$accessories.rooms(), this.filter(), this.batteryIndex(), this.$accessories.filterContext()),
  )

  /** Group key of the rooms on no floor, shown with its translated label */
  protected readonly floorOtherKey = FLOOR_OTHER_KEY

  public readonly labels = this.$accessories.labels

  /** Whether any filter is set, so manage-layout mode uses the filtered drag-and-drop */
  public readonly filterActive = computed(() => isFilterActive(this.filter()))

  /**
   * Every room in layout order, with the services the filter shows in it (none for a room whose
   * services are all filtered out). Used in filtered manage-layout mode, so each room can be a drop target.
   */
  public readonly manageRooms = computed<AccessoryGroup[]>(() => {
    const visible = this.groups()
    return this.$accessories.rooms().map(room => ({
      key: room.name,
      label: room.name,
      services: visible.find(group => group.key === room.name)?.services ?? [],
    }))
  })

  public readonly totalCount = computed(() =>
    this.$accessories.rooms().reduce((count, room) => count + room.services.length, 0),
  )

  public readonly shownCount = computed(() =>
    this.groups().reduce((count, group) => count + group.services.length, 0),
  )

  public readonly allCollapsed = computed(() => {
    const groups = this.groups()
    return groups.length > 0 && groups.every(group => this.collapsed().has(this.groupId(group)))
  })

  // Getter/setter for dragula two-way binding
  public get rooms(): Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }> {
    return this.$accessories.rooms()
  }

  public set rooms(value: Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>) {
    this.$accessories.rooms.set(value)
  }

  constructor() {
    const dragulaService = this.dragulaService

    // Dragula is used only in manage-layout mode with no filter, where the model and the DOM stay
    // 1-to-1. While a filter hides items, manage-layout uses CDK drag-and-drop by uniqueId instead,
    // because dragula's index splices would hit the wrong accessory (#2790).
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => this.usesDragula() && !!handle?.classList.contains('drag-handle'),
    })

    dragulaService.createGroup('services-bag', {
      moves: el => this.usesDragula() && !el?.classList.contains('no-drag'),
    })

    // Save the room and service layout
    dragulaService.drop()
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        setTimeout(() => {
          this.$accessories.saveLayout()
        })
      })
  }

  public ngOnInit(): void {
    // Set page title
    const title = this.$translate.instant('menu.label_accessories')
    this.$settings.setPageTitle(title)

    void this.$accessories.start()

    // Subscribe to accessory data to update available bridges
    this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateAvailableBridges()
    })
  }

  public async addRoom(): Promise<void> {
    const injector = createEnvironmentInjector([
      {
        provide: ADD_ROOM_MODAL_DATA,
        useValue: {
          existingRooms: this.$accessories.rooms(),
        },
      },
    ], this.injector)

    const ref = this.$modal.open(AddRoomComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result: { name: string, isDefault: boolean } = await ref.result
      // No room name provided (validation should prevent this, but safety check)
      if (!result?.name || !result.name.length) {
        return
      }

      // If setting as default, unset other default rooms
      if (result.isDefault) {
        this.$accessories.rooms.update(current => current.map(r => ({
          ...r,
          isDefault: false,
        })))
      }

      this.$accessories.rooms.update(current => [
        ...current,
        {
          name: result.name,
          isDefault: result.isDefault,
          services: [],
        },
      ])

      // Save the layout to persist the new room
      this.$accessories.saveLayout()

      if (this.layoutLocked()) {
        this.toggleLayoutLock()
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public async editRoom(roomIndex: number): Promise<void> {
    const room = this.$accessories.rooms()[roomIndex]
    if (!room) {
      return
    }

    const injector = createEnvironmentInjector([
      {
        provide: EDIT_ROOM_MODAL_DATA,
        useValue: {
          roomName: room.name,
          isDefault: room.isDefault || false,
          existingRooms: this.$accessories.rooms(),
          currentRoomIndex: roomIndex,
          floors: this.$accessories.floors().map(floor => floor.name),
          currentFloor: this.$accessories.floors().find(floor => floor.rooms.includes(room.name))?.name ?? null,
        },
      },
    ], this.injector)

    const ref = this.$modal.open(EditRoomComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result: { name?: string, isDefault?: boolean, floor?: string | null, delete?: boolean } = await ref.result

      // Handle delete mode
      if (result?.delete) {
        const roomToDelete = this.$accessories.rooms()[roomIndex]
        if (!roomToDelete) {
          return
        }

        // Find target room to move services to
        let targetRoomIndex: number
        if (roomToDelete.isDefault) {
          // If deleting default room, move services to first other room (which will become new default)
          targetRoomIndex = roomIndex === 0
            ? 1
            : 0
        } else {
          // If deleting non-default room, move services to current default room
          const defaultRoomIndex = this.$accessories.rooms().findIndex(r => r.isDefault)
          targetRoomIndex = defaultRoomIndex !== -1
            ? defaultRoomIndex
            : 0
        }

        // If deleting the default room, set the target room as the new default
        if (roomToDelete.isDefault) {
          this.$accessories.rooms.update(current => current.map((r, idx) =>
            idx === targetRoomIndex
              ? { ...r, isDefault: true }
              : { ...r, isDefault: false },
          ))
        }

        // Move services from room being deleted to target room
        const servicesToMove = roomToDelete.services
        if (servicesToMove.length > 0) {
          this.$accessories.rooms.update(current => current.map((r, idx) =>
            idx === targetRoomIndex
              ? {
                  ...r,
                  services: [
                    ...r.services,
                    ...servicesToMove,
                  ],
                }
              : r,
          ))
        }

        // Remove the room
        this.$accessories.rooms.update(current => current.filter((_, idx) => idx !== roomIndex))
        this.$accessories.removeRoomFromFloors(roomToDelete.name)

        // Save the layout to persist the changes
        this.$accessories.saveLayout()
        return
      }

      // Handle edit mode
      // No room name provided (validation should prevent this, but safety check)
      if (!result?.name || !result.name.length) {
        return
      }

      // If setting as default, unset other default rooms
      if (result.isDefault) {
        this.$accessories.rooms.update(current => current.map(r => ({
          ...r,
          isDefault: false,
        })))
      }

      // Update the room
      this.$accessories.rooms.update(current => current.map((r, idx) =>
        idx === roomIndex
          ? { ...r, name: result.name!, isDefault: result.isDefault ?? false }
          : r,
      ))

      // Keep the floors pointing at the room under its new name, then apply the floor picked
      this.$accessories.renameRoomInFloors(room.name, result.name)
      if (result.floor !== undefined) {
        this.$accessories.setRoomFloor(result.name, result.floor)
      }

      // Save the layout to persist the changes
      this.$accessories.saveLayout()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public toggleLayoutLock(): void {
    this.layoutLocked.set(!this.layoutLocked())
  }

  public openSupport(): void {
    this.$modal.open(AccessorySupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy(): void {
    this.$accessories.stop()

    // Destroy drag and drop bags
    this.dragulaService.destroy?.('rooms-bag')
    this.dragulaService.destroy?.('services-bag')

    // Clean up WebSocket connections
  }

  /**
   * Update the list of available bridges from the current accessories
   * Each bridge is named by the name it advertises
   */
  private updateAvailableBridges(): void {
    const bridges = new Set<string>()

    this.$accessories.rooms().forEach((room) => {
      room.services.forEach((service) => {
        if (service.instance?.username) {
          const bridgeName = serviceBridgeName(service)
          if (bridgeName) {
            bridges.add(bridgeName)
          }
        }
      })
    })

    const newBridges = [...bridges].toSorted((a, b) => {
      // Sort with "Homebridge" first, then alphabetically
      if (a === 'Homebridge') {
        return -1
      }
      if (b === 'Homebridge') {
        return 1
      }
      return a.localeCompare(b)
    })

    // Only update if the bridge list has changed AND is not fewer bridges than before
    // This prevents race condition where WebSocket bridge names haven't loaded yet
    const currentAvailable = this.availableBridges()
    const shouldUpdate = JSON.stringify(newBridges) !== JSON.stringify(currentAvailable)
      && newBridges.length >= currentAvailable.length

    if (shouldUpdate) {
      this.availableBridges.set(newBridges)
    }
  }

  /**
   * Re-emit the rooms signal with the dropped room's services replaced.
   * `[(dragulaModel)]="room.services"` would mutate the leaf in place
   * without telling the signal anything had changed, leaving computeds
   * over `rooms` stale (persistence still worked via saveLayout's
   * synchronous read of the mutated value).
   */
  public onServicesReorder(
    room: { name: string, isDefault?: boolean, services: ServiceTypeX[] },
    newServices: ServiceTypeX[],
  ): void {
    this.$accessories.rooms.update(prev => prev.map(r => (
      r === room
        ? { ...r, services: newServices }
        : r
    )))
  }

  /** Called by the toolbar with the next filter. Manage-layout mode changes nothing about it. */
  public onFilterChange(next: AccessoryFilterState): void {
    this.$accessories.setFilterState(next)
  }

  /**
   * Toggle manage layout mode. The filter, grouping and sort stay as the user set them. Manage mode
   * only adds editing, and the drag behaviour follows the view (see manageView).
   */
  public toggleManageLayout(): void {
    if (this.manageLayoutMode) {
      this.manageLayoutMode = false
      if (!this.layoutLocked()) {
        this.toggleLayoutLock()
      }
      return
    }

    this.manageLayoutMode = true
    if (this.layoutLocked()) {
      this.toggleLayoutLock()
    }
  }

  /** The drag behaviour for the view the user chose, with manage-layout mode on */
  public manageView(): ManageView {
    if (!this.manageLayoutMode) {
      return 'off'
    }
    const { groupBy, sortBy } = this.filter()
    if (groupBy !== 'room') {
      return 'ungrouped'
    }
    if (sortBy !== 'manual') {
      return 'sorted'
    }
    return this.filterActive()
      ? 'filtered'
      : 'dragula'
  }

  /** Whether dragula does the drag-and-drop: room grouping, manual sort, no filter */
  public usesDragula(): boolean {
    return this.manageView() === 'dragula'
  }

  /** Whether CDK moves tiles by uniqueId and rooms can be reordered: room grouping, manual sort, with a filter */
  public manageFiltered(): boolean {
    return this.manageView() === 'filtered'
  }

  /** Whether tiles move between rooms only, while sorted by something other than layout order */
  public manageSorted(): boolean {
    return this.manageView() === 'sorted'
  }

  /** Whether the room headers and every room are shown in manage-layout mode (room grouping, not dragula) */
  public manageRoomRows(): boolean {
    return this.manageLayoutMode && this.filter().groupBy === 'room' && !this.usesDragula()
  }

  /** Whether tiles can be dragged at all, in the normal filtered view or in manage-layout mode */
  public tilesDraggable(): boolean {
    return this.canDragBetweenRooms() || this.manageFiltered() || this.manageSorted()
  }

  /**
   * Whether tiles can be dragged onto another room's group in the normal view, while a room grouping is filtered.
   */
  public canDragBetweenRooms(): boolean {
    return !this.manageLayoutMode && this.filter().groupBy === 'room' && isFilterActive(this.filter())
  }

  /** The room groups the page shows: every room in manage-layout mode with room grouping, else the filtered groups */
  public displayGroups(): AccessoryGroup[] {
    return this.manageRoomRows()
      ? this.manageRooms()
      : this.groups()
  }

  /** The translated name of the sort in use, for the manage-layout sort hint */
  public sortLabel(): string {
    return this.$translate.instant(`accessories.toolbar.sort_${this.filter().sortBy}`)
  }

  /** How many of a room's services the filter hides */
  public hiddenCountFor(group: AccessoryGroup): number {
    const total = this.$accessories.rooms().find(room => room.name === group.key)?.services.length ?? 0
    return total - group.services.length
  }

  /** Index of a room in the full rooms list, for the room's edit dialog */
  public roomIndexOf(roomName: string): number {
    return this.$accessories.rooms().findIndex(room => room.name === roomName)
  }

  /**
   * A tile was dropped into a room's group. In filtered manage-layout mode it is placed by uniqueId
   * among the full room. Otherwise it moves between rooms (appended to the target room), and a drop
   * within the same group does nothing.
   */
  public onRoomDrop(event: CdkDragDrop<string, string, string>): void {
    if (this.manageFiltered()) {
      this.placeDroppedTile(event)
      return
    }
    if (event.previousContainer === event.container || !(this.canDragBetweenRooms() || this.manageSorted())) {
      return
    }
    const uniqueId = event.item.data
    const roomName = event.container.data
    if (!uniqueId || !roomName) {
      return
    }
    this.$accessories.moveServicesToRoom([uniqueId], roomName)
    this.$toastr.success(this.$translate.instant('accessories.move.moved', { room: roomName }))
  }

  /**
   * Place a dropped tile by uniqueId, using its neighbours in the visible group after the drop.
   * Hidden services keep their places in the full room.
   */
  private placeDroppedTile(event: CdkDragDrop<string, string, string>): void {
    const uniqueId = event.item.data
    const roomName = event.container.data
    const group = this.displayGroups().find(entry => entry.key === roomName)
    if (!uniqueId || !group) {
      return
    }
    const others = group.services.map(service => service.uniqueId ?? '').filter(id => id !== uniqueId)
    const before = others[event.currentIndex] ?? null
    const after = event.currentIndex > 0
      ? (others[event.currentIndex - 1] ?? null)
      : null
    this.$accessories.placeService(uniqueId, roomName, before, after)
  }

  /**
   * A room header was dropped in filtered manage-layout mode. Places the room among the full rooms
   * list by its visible neighbours, so rooms hidden by the filter keep their order.
   */
  public onRoomReorder(event: CdkDragDrop<unknown>): void {
    if (!this.manageFiltered() || event.previousIndex === event.currentIndex) {
      return
    }
    const names = this.displayGroups().map(group => group.key)
    const roomName = names[event.previousIndex]
    if (!roomName) {
      return
    }
    const order = [...names]
    moveItemInArray(order, event.previousIndex, event.currentIndex)
    const index = event.currentIndex
    this.$accessories.placeRoom(roomName, order[index + 1] ?? null, index > 0
      ? (order[index - 1] ?? null)
      : null)
  }

  /** Room badges for a group, computed from the services shown in it */
  public summaryFor(group: AccessoryGroup): RoomSummary {
    return summarizeRoom(group.services, this.batteryIndex())
  }

  /** Identifies a group across renders, including its grouping, so collapse state is per view */
  public groupId(group: AccessoryGroup): string {
    return `${this.filter().groupBy}:${group.key}`
  }

  public isCollapsed(group: AccessoryGroup): boolean {
    return this.collapsed().has(this.groupId(group))
  }

  public toggleGroup(group: AccessoryGroup): void {
    const next = new Set(this.collapsed())
    const id = this.groupId(group)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    this.setCollapsed(next)
  }

  /** Collapse every group on screen, or expand them all when they are already collapsed */
  public toggleAllGroups(): void {
    this.setCollapsed(this.allCollapsed()
      ? new Set()
      : new Set(this.groups().map(group => this.groupId(group))))
  }

  private setCollapsed(next: ReadonlySet<string>): void {
    this.collapsed.set(next)
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // Storage unavailable: collapse still works for this visit
    }
  }

  private loadCollapsed(): ReadonlySet<string> {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(COLLAPSED_STORAGE_KEY) ?? '[]')
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
      }
    } catch {
      // Corrupt or unavailable storage: start with every group expanded
    }
    return new Set()
  }
}
