import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop'
import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'
import { ToastrService } from 'ngx-toastr'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { AccessoryFilterState, AccessoryGroup, DEFAULT_FILTER_STATE, FLOOR_OTHER_KEY, groupAndSort, isFilterActive } from '@/app/core/accessories/filters/accessory-filters'
import { RoomSummary, summarizeRoom } from '@/app/core/accessories/filters/room-summary'
import { serviceBridgeName } from '@/app/core/accessories/filters/service-helpers'
import { AuthService } from '@/app/core/auth/auth.service'
import { listenUntilDestroyed } from '@/app/core/communication/socket-listener'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { AccessoriesToolbarComponent } from '@/app/modules/accessories/accessories-toolbar/accessories-toolbar.component'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ManageViewsComponent } from '@/app/modules/accessories/manage-views/manage-views.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'

/** localStorage key for the collapsed group ids */
const COLLAPSED_STORAGE_KEY = 'accessories-collapsed-v1'

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
    CdkDropList,
    CdkDropListGroup,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
  ],
  standalone: true,
  templateUrl: './accessories.component.html',
  styleUrl: './accessories.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  protected $accessories = inject(AccessoriesService)
  /** Injected so the tablets' accessories follow saved views while this page is open */
  public readonly $kioskDevices = inject(KioskDevicesService)

  private destroyRef = inject(DestroyRef)
  private $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private ioStatus!: IoNamespace
  private ioChild!: IoNamespace

  // Getter for persisted bridge name mapping from service
  private get bridgeUsernameToNameMap(): Map<string, string> {
    return this.$accessories.bridgeUsernameToNameMap
  }

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  // The room/tile layout starts locked; toggleLayoutLock opens it for editing
  public readonly layoutLocked = signal<boolean>(true)
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly hasPlugins = signal(this.$settings.env.hasInstalledPlugins ?? true)
  public manageLayoutMode = false
  /** The user's filter, put back when manage-layout mode is left */
  private filterBeforeManage: AccessoryFilterState | null = null

  // Signal references for persisted properties from service (persist across navigation)
  public readonly availableBridges = this.$accessories.availableBridges
  public readonly filter = this.$accessories.filterState
  public readonly collapsed = signal<ReadonlySet<string>>(this.loadCollapsed())
  public readonly selectMode = signal(false)
  public readonly selectedIds = signal<ReadonlySet<string>>(new Set())
  public readonly bulkRoom = signal('')
  public readonly placeholders = Array.from({ length: 10 })
  private $toastr = inject(ToastrService)

  /** Bumped when a bridge is renamed on the socket, so the labelled rooms are rebuilt */
  private readonly bridgeNamesVersion = signal(0)

  /**
   * The rooms with each bridge named the way the page shows it (the name from the config
   * when there is one). The filter matches bridges by these names.
   */
  public readonly labelledRooms = computed(() => {
    this.bridgeNamesVersion()
    return this.$accessories.rooms().map(room => ({
      ...room,
      services: room.services.map(service => this.withBridgeName(service)),
    }))
  })

  public readonly batteryIndex = computed(() =>
    buildBatteryIndex(this.labelledRooms().flatMap(room => room.services)),
  )

  /** The accessories to show, filtered, grouped and sorted */
  public readonly groups = computed<AccessoryGroup[]>(() =>
    groupAndSort(this.labelledRooms(), this.filter(), this.batteryIndex(), this.$accessories.filterContext()),
  )

  /** Group key of the rooms on no floor, shown with its translated label */
  protected readonly floorOtherKey = FLOOR_OTHER_KEY

  /** The saved views, with the active one's id */
  public readonly views = this.$accessories.views
  public readonly labels = this.$accessories.labels
  public readonly activeViewId = this.$accessories.activeViewId
  public readonly username = this.$auth.user.username ?? ''

  public readonly totalCount = computed(() =>
    this.labelledRooms().reduce((count, room) => count + room.services.length, 0),
  )

  public readonly shownCount = computed(() =>
    this.groups().reduce((count, group) => count + group.services.length, 0),
  )

  public readonly allCollapsed = computed(() => {
    const groups = this.groups()
    return groups.length > 0 && groups.every(group => this.collapsed().has(this.groupId(group)))
  })

  /** The name a service's bridge is shown under: the custom name from the config, else the bridge's own */
  private withBridgeName(service: ServiceTypeX): ServiceTypeX {
    const username = service.instance?.username
    if (!username) {
      return service
    }
    const name = this.bridgeUsernameToNameMap.get(username) || service.instance?.name
    if (!name || name === serviceBridgeName(service)) {
      return service
    }
    const bridge = typeof service.bridge === 'object' && service.bridge !== null
      ? service.bridge
      : {}
    return {
      ...service,
      bridge: {
        ...bridge,
        username,
        name,
      },
    } as unknown as ServiceTypeX
  }

  /** Called when a bridge name arrives or changes on the socket */
  private bridgeNamesChanged(): void {
    this.bridgeNamesVersion.update(version => version + 1)
    this.updateAvailableBridges()
  }

  // Getter/setter for dragula two-way binding
  public get rooms(): Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }> {
    return this.$accessories.rooms()
  }

  public set rooms(value: Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>) {
    this.$accessories.rooms.set(value)
  }

  constructor() {
    const dragulaService = this.dragulaService

    // Drag-and-drop is restricted to manage-layout mode, where filters are guaranteed off and the
    // dragula model + DOM stay 1-to-1. Allowing drag while filters hide items causes the model
    // splice to operate on the wrong indexes (#2790).
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => this.manageLayoutMode && !!handle?.classList.contains('drag-handle'),
    })

    dragulaService.createGroup('services-bag', {
      moves: el => this.manageLayoutMode && !el?.classList.contains('no-drag'),
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

    // Set up WebSocket connections to get custom bridge names
    this.setupBridgeNameMapping()

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
    this.ioStatus?.end?.()
    this.ioChild?.end?.()
  }

  /**
   * Set up WebSocket connections to get custom bridge names from config
   */
  private setupBridgeNameMapping(): void {
    // Connect to status namespace for main Homebridge instance
    this.ioStatus = this.$ws.connectToNamespace('status')
    this.ioStatus.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.ioStatus.socket.emit('monitor-server-status')
    })

    listenUntilDestroyed(this.destroyRef, this.ioStatus.socket).on('homebridge-status', (data: any) => {
      if (data.username) {
        this.bridgeUsernameToNameMap.set(data.username, 'Homebridge')
        this.bridgeNamesChanged()
      }
    })

    // Connect to child-bridges namespace for child bridge instances
    this.ioChild = this.$ws.connectToNamespace('child-bridges')
    this.ioChild.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.ioChild.socket.emit('monitor-child-bridge-status')
      this.fetchChildBridges()
    })

    listenUntilDestroyed(this.destroyRef, this.ioChild.socket).on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
      this.bridgeUsernameToNameMap.set(data.username, data.name)
      this.bridgeNamesChanged()
    })
  }

  /**
   * Fetch initial list of child bridges
   */
  private fetchChildBridges(): void {
    this.ioChild.request('get-homebridge-child-bridge-status').subscribe((data: ChildBridgeStatusResponse[]) => {
      data.forEach((bridge) => {
        this.bridgeUsernameToNameMap.set(bridge.username, bridge.name)
      })
      this.bridgeNamesChanged()
    })
  }

  /**
   * Update the list of available bridges from the current accessories
   * Uses custom names from config if available
   */
  private updateAvailableBridges(): void {
    const bridges = new Set<string>()

    this.labelledRooms().forEach((room) => {
      room.services.forEach((service) => {
        if (service.instance?.username) {
          // Custom name from the config when there is one, otherwise the bridge's own name
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

  /**
   * Called by the toolbar with the next filter. Picking a filter leaves manage-layout
   * mode, because a filtered view must not be rearranged (#2790).
   */
  public onFilterChange(next: AccessoryFilterState): void {
    if (this.manageLayoutMode) {
      this.manageLayoutMode = false
      this.filterBeforeManage = null
      if (!this.layoutLocked()) {
        this.toggleLayoutLock()
      }
    }
    // Changing the filter by hand leaves any view it came from, with its pinned and excluded accessories
    this.$accessories.activeViewId.set(null)
    this.$accessories.setFilterState(next)
  }

  /**
   * A saved view was picked. The toolbar has already set its filter, so this only
   * records which view is active, for its pinned and excluded accessories.
   */
  public onViewSelect(viewId: string | null): void {
    this.$accessories.activeViewId.set(viewId)
  }

  /** Save the current filter as a named view, and make it the active one */
  public onSaveView(name: string): void {
    const id = this.$accessories.createViewFromState(name, this.filter())
    if (id) {
      this.$accessories.activeViewId.set(id)
    }
  }

  /** Open the modal to rename, reorder, share, delete and edit the pinned and excluded accessories of views */
  public openManageViews(): void {
    this.$modal.open(ManageViewsComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  /**
   * Toggle manage layout mode. It forces the default filter while on, so every tile is
   * shown and drag-and-drop stays 1-to-1 with the model (#2790). The user's filter comes back when it ends.
   */
  public toggleManageLayout(): void {
    if (this.manageLayoutMode) {
      this.manageLayoutMode = false
      if (this.filterBeforeManage) {
        this.$accessories.setFilterState(this.filterBeforeManage)
      }
      this.filterBeforeManage = null
      if (!this.layoutLocked()) {
        this.toggleLayoutLock()
      }
      return
    }

    this.clearSelection()
    this.selectMode.set(false)
    this.manageLayoutMode = true
    this.filterBeforeManage = {
      ...this.filter(),
    }
    this.$accessories.setFilterState({ ...DEFAULT_FILTER_STATE }, false)

    if (this.layoutLocked()) {
      this.toggleLayoutLock()
    }
  }

  /**
   * Whether tiles can be dragged onto another room's group. Only while a room grouping is filtered:
   * never in manage-layout mode, where dragula owns the drag-and-drop (#2790).
   */
  public canDragBetweenRooms(): boolean {
    return !this.manageLayoutMode && this.filter().groupBy === 'room' && isFilterActive(this.filter())
  }

  /** A tile was dropped into a room's group. Moves it by uniqueId; a drop within the same group does nothing. */
  public onRoomDrop(event: CdkDragDrop<string, string, string>): void {
    if (event.previousContainer === event.container || !this.canDragBetweenRooms()) {
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

  public isSelected(service: ServiceTypeX): boolean {
    return this.selectedIds().has(service.uniqueId ?? '')
  }

  public toggleSelectMode(): void {
    if (this.manageLayoutMode) {
      return
    }
    this.clearSelection()
    this.selectMode.update(active => !active)
  }

  public toggleSelected(service: ServiceTypeX): void {
    const id = service.uniqueId ?? ''
    if (!id) {
      return
    }
    const next = new Set(this.selectedIds())
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    this.selectedIds.set(next)
  }

  /** Select every accessory in the current filtered result */
  public selectAllMatching(): void {
    const ids = this.groups()
      .flatMap(group => group.services)
      .map(service => service.uniqueId ?? '')
      .filter(id => id !== '')
    this.selectedIds.set(new Set(ids))
  }

  public onBulkRoom(event: Event): void {
    this.bulkRoom.set((event.target as HTMLSelectElement).value)
  }

  public moveSelectedToRoom(): void {
    const room = this.bulkRoom()
    if (!room || this.selectedIds().size === 0) {
      return
    }
    this.$accessories.moveServicesToRoom([
      ...this.selectedIds(),
    ], room)
    this.clearSelection()
  }

  public hideSelected(): void {
    if (this.selectedIds().size === 0) {
      return
    }
    this.$accessories.updateServicesFlags([
      ...this.selectedIds(),
    ], { hidden: true })
    this.clearSelection()
  }

  public showSelectedOnDashboard(): void {
    if (this.selectedIds().size === 0) {
      return
    }
    this.$accessories.updateServicesFlags([
      ...this.selectedIds(),
    ], { onDashboard: true })
    this.clearSelection()
  }

  private clearSelection(): void {
    this.selectedIds.set(new Set())
    this.bulkRoom.set('')
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
