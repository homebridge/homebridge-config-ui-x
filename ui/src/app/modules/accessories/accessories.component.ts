import { NgTemplateOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute } from '@angular/router'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'

import { ServiceTypeX, SmartAutomation } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'
import { SmartAutomationFormComponent } from '@/app/modules/accessories/smart-automation-form/smart-automation-form.component'
import { SmartAutomationListComponent } from '@/app/modules/accessories/smart-automation-list/smart-automation-list.component'

@Component({
  selector: 'app-accessories',
  imports: [
    NgTemplateOutlet,
    NgbTooltip,
    NgbDropdown,
    NgbDropdownToggle,
    NgbDropdownMenu,
    NgbDropdownItem,
    DragulaModule,
    AccessoryTileComponent,
    DragHerePlaceholderComponent,
    SmartAutomationFormComponent,
    SmartAutomationListComponent,
    TranslatePipe,
    FormsModule,
  ],
  standalone: true,
  templateUrl: './accessories.component.html',
  styleUrl: './accessories.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  protected $accessories = inject(AccessoriesService)

  private destroyRef = inject(DestroyRef)
  private $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private $md = inject(MobileDetectService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private $route = inject(ActivatedRoute)
  private ioStatus!: IoNamespace
  private ioChild!: IoNamespace

  // Getter for persisted bridge name mapping from service
  private get bridgeUsernameToNameMap(): Map<string, string> {
    return this.$accessories.bridgeUsernameToNameMap
  }

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  public readonly isMobile = signal<boolean | string>(false)
  public readonly hideHidden = signal(true)
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fas fa-up-right-from-square primary-text"></i></a>'
  public readonly hasPlugins = signal(this.$settings.env.hasInstalledPlugins ?? true)
  public manageLayoutMode = false
  private previousBridgeSelection: string[] | null = null
  public readonly isSmartAutomationView = this.$route.snapshot.data.view === 'smart-automation'
  public readonly smartAutomations = signal<SmartAutomation[]>([])
  public readonly automationSwitchStates = signal<Record<string, boolean>>({})
  public smartAutomationDraft: Partial<SmartAutomation> = {
    type: 'smart-light-group',
    restoreAfterMs: 30000,
    uniqueIds: [],
    enabled: true,
  }

  private automationSwitchResetTimers = new Map<string, ReturnType<typeof setTimeout>>()
  public readonly selectedLightUniqueIds = signal<string[]>([])

  // Signal references for persisted properties from service (persist across navigation)
  public readonly availableBridges = this.$accessories.availableBridges
  public readonly selectedBridges = this.$accessories.selectedBridges

  /**
   * Computed property to check if filter UI should be shown
   */
  public readonly shouldShowFilters = computed(() =>
    this.hasPlugins() && this.availableBridges().length > 0,
  )

  // Getter/setter for dragula two-way binding
  public get rooms(): Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }> {
    return this.$accessories.rooms()
  }

  public set rooms(value: Array<{ name: string, isDefault?: boolean, services: ServiceTypeX[] }>) {
    this.$accessories.rooms.set(value)
  }

  constructor() {
    const dragulaService = this.dragulaService

    this.isMobile.set(this.$md.detect.mobile() || false)

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

    this.isMobile.set(true)
  }

  public ngOnInit(): void {
    // Set page title
    const title = this.isSmartAutomationView
      ? 'Smart Automation'
      : this.$translate.instant('menu.label_accessories')
    this.$settings.setPageTitle(title)

    // Initialize selectedBridges if null or empty - default to showing all bridges
    const selected = this.selectedBridges()
    if ((selected === null || selected.length === 0) && this.availableBridges().length > 0) {
      this.selectedBridges.set([...this.availableBridges()])
    }

    void this.$accessories.start()
      .then(() => this.isSmartAutomationView ? this.loadSmartAutomations() : undefined)
      .catch((error) => {
        console.error(error)
      })

    // Set up WebSocket connections to get custom bridge names
    this.setupBridgeNameMapping()

    // Subscribe to accessory data to update available bridges
    this.$accessories.accessoryData.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateAvailableBridges()
    })
  }

  public async addRoom(): Promise<void> {
    const injector = createEnvironmentInjector([{
      provide: ADD_ROOM_MODAL_DATA,
      useValue: {
        existingRooms: this.$accessories.rooms(),
      },
    }], this.injector)

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

      this.$accessories.rooms.update(current => [...current, {
        name: result.name,
        isDefault: result.isDefault,
        services: [],
      }])

      // Save the layout to persist the new room
      this.$accessories.saveLayout()

      if (this.isMobile()) {
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

    const injector = createEnvironmentInjector([{
      provide: EDIT_ROOM_MODAL_DATA,
      useValue: {
        roomName: room.name,
        isDefault: room.isDefault || false,
        existingRooms: this.$accessories.rooms(),
        currentRoomIndex: roomIndex,
      },
    }], this.injector)

    const ref = this.$modal.open(EditRoomComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result: { name?: string, isDefault?: boolean, delete?: boolean } = await ref.result

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
          targetRoomIndex = roomIndex === 0 ? 1 : 0
        } else {
          // If deleting non-default room, move services to current default room
          const defaultRoomIndex = this.$accessories.rooms().findIndex(r => r.isDefault)
          targetRoomIndex = defaultRoomIndex !== -1 ? defaultRoomIndex : 0
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
              ? { ...r, services: [...r.services, ...servicesToMove] }
              : r,
          ))
        }

        // Remove the room
        this.$accessories.rooms.update(current => current.filter((_, idx) => idx !== roomIndex))

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

      // Save the layout to persist the changes
      this.$accessories.saveLayout()
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public toggleLayoutLock(): void {
    this.isMobile.set(!this.isMobile())
  }

  public openSupport(): void {
    this.$modal.open(AccessorySupportComponent, {
      size: 'lg',
      backdrop: 'static',
    })
  }

  public ngOnDestroy(): void {
    this.$accessories.stop()
    this.automationSwitchResetTimers.forEach(timer => clearTimeout(timer))
    this.automationSwitchResetTimers.clear()

    // Destroy drag and drop bags
    this.dragulaService.destroy?.('rooms-bag')
    this.dragulaService.destroy?.('services-bag')

    // Clean up WebSocket connections
    this.ioStatus?.end?.()
    this.ioChild?.end?.()
  }

  public toggleLightSelection(uniqueId: string, selected: boolean): void {
    const next = selected
      ? [...new Set([...this.selectedLightUniqueIds(), uniqueId])]
      : this.selectedLightUniqueIds().filter(id => id !== uniqueId)
    this.selectedLightUniqueIds.set(next)
  }

  public editSmartAutomation(automation: SmartAutomation): void {
    this.smartAutomationDraft = { ...automation, uniqueIds: [...automation.uniqueIds] }
    this.selectedLightUniqueIds.set([...automation.uniqueIds])
  }

  public async saveSmartAutomation(): Promise<void> {
    try {
      const draft = {
        ...this.smartAutomationDraft,
        uniqueIds: [...new Set(this.selectedLightUniqueIds())],
        type: 'smart-light-group' as const,
        enabled: this.smartAutomationDraft.enabled ?? true,
      }

      const saved = await this.$accessories.saveSmartAutomation(draft)
      const current = this.smartAutomations()
      const exists = current.some(item => item.id === saved.id)
      this.smartAutomations.set(exists
        ? current.map(item => item.id === saved.id ? saved : item)
        : [...current, saved],
      )
      this.resetSmartAutomationDraft()
    } catch (error) {
      console.error(error)
    }
  }

  public async deleteSmartAutomation(id: string): Promise<void> {
    try {
      await this.$accessories.deleteSmartAutomation(id)
      this.smartAutomations.set(this.smartAutomations().filter(x => x.id !== id))
      this.clearAutomationSwitchState(id)
      if (this.smartAutomationDraft.id === id) {
        this.resetSmartAutomationDraft()
      }
    } catch (error) {
      console.error(error)
    }
  }

  public runSmartAutomation(automation: SmartAutomation): void {
    this.$accessories.runSmartLightGroupAutomation(automation.uniqueIds, automation.restoreAfterMs)
  }

  public isAutomationSwitchOn(id: string): boolean {
    return !!this.automationSwitchStates()[id]
  }

  public toggleAutomationSwitch(automation: SmartAutomation, enabled: boolean): void {
    if (!automation.enabled) {
      this.setAutomationSwitchState(automation.id, false)
      return
    }

    this.setAutomationSwitchState(automation.id, enabled)

    if (!enabled) {
      this.clearAutomationResetTimer(automation.id)
      return
    }

    this.runSmartAutomation(automation)
    this.clearAutomationResetTimer(automation.id)
    const resetAfterMs = Number.isInteger(automation.restoreAfterMs) && automation.restoreAfterMs > 0
      ? automation.restoreAfterMs
      : 30000

    const timer = setTimeout(() => {
      this.setAutomationSwitchState(automation.id, false)
      this.clearAutomationResetTimer(automation.id)
    }, resetAfterMs)
    this.automationSwitchResetTimers.set(automation.id, timer)
  }

  public async setSmartAutomationEnabled(automation: SmartAutomation, enabled: boolean): Promise<void> {
    try {
      const saved = await this.$accessories.saveSmartAutomation({
        ...automation,
        enabled,
      })
      this.smartAutomations.update(current => current.map(item => item.id === saved.id ? saved : item))
      if (!enabled) {
        this.clearAutomationSwitchState(automation.id)
      }
    } catch (error) {
      console.error(error)
    }
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

    this.ioStatus.socket.on('homebridge-status', (data: any) => {
      if (data.username) {
        this.bridgeUsernameToNameMap.set(data.username, 'Homebridge')
      }
    })

    // Connect to child-bridges namespace for child bridge instances
    this.ioChild = this.$ws.connectToNamespace('child-bridges')
    this.ioChild.connected!.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.ioChild.socket.emit('monitor-child-bridge-status')
      this.fetchChildBridges()
    })

    this.ioChild.socket.on('child-bridge-status-update', (data: ChildBridgeStatusResponse) => {
      this.bridgeUsernameToNameMap.set(data.username, data.name)
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
    })
  }

  /**
   * Update the list of available bridges from the current accessories
   * Uses custom names from config if available
   */
  private updateAvailableBridges(): void {
    const bridges = new Set<string>()

    this.$accessories.rooms().forEach((room) => {
      room.services.forEach((service) => {
        if (service.instance?.username) {
          // Use custom name from mapping if available, otherwise fallback to instance.name
          const customName = this.bridgeUsernameToNameMap.get(service.instance.username)
          const bridgeName = customName || service.instance.name
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
    const currentSelected = this.selectedBridges()
    const shouldUpdate = JSON.stringify(newBridges) !== JSON.stringify(currentAvailable)
      && newBridges.length >= currentAvailable.length

    if (shouldUpdate) {
      if (currentSelected === null || currentSelected.length === 0) {
        // First initialization or no bridges selected - select all bridges by default
        this.selectedBridges.set([...newBridges])
      } else {
        // Check if we were showing all bridges before the update
        const wasShowingAll = currentSelected.length === currentAvailable.length
          && currentAvailable.length > 0

        if (wasShowingAll) {
          // If showing all, keep showing all even when new bridges appear
          this.selectedBridges.set([...newBridges])
        } else {
          // Remove any selected bridges that no longer exist, but don't add new ones
          this.selectedBridges.set(currentSelected.filter(bridge => newBridges.includes(bridge)))
        }
      }

      // Update available bridges after handling selection
      this.availableBridges.set(newBridges)
    }
  }

  private async loadSmartAutomations(): Promise<void> {
    try {
      this.smartAutomations.set(await this.$accessories.getSmartAutomations())
    } catch (error) {
      console.error(error)
    }
  }

  private resetSmartAutomationDraft(): void {
    this.smartAutomationDraft = {
      type: 'smart-light-group',
      restoreAfterMs: 30000,
      uniqueIds: [],
      enabled: true,
    }
    this.selectedLightUniqueIds.set([])
  }

  private setAutomationSwitchState(id: string, enabled: boolean): void {
    this.automationSwitchStates.update((current) => {
      const next = { ...current }
      if (enabled) {
        next[id] = true
      } else {
        delete next[id]
      }
      return next
    })
  }

  private clearAutomationResetTimer(id: string): void {
    const timer = this.automationSwitchResetTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.automationSwitchResetTimers.delete(id)
    }
  }

  private clearAutomationSwitchState(id: string): void {
    this.setAutomationSwitchState(id, false)
    this.clearAutomationResetTimer(id)
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
      r === room ? { ...r, services: newServices } : r
    )))
  }

  /**
   * Check if a service should be displayed based on current filters
   */
  public shouldDisplayService(service: ServiceTypeX): boolean {
    // In manage layout mode, show ALL accessories so the dragula model and DOM stay 1-to-1 (#2790).
    // Filtering inside the dragula container desynchronises model indexes from DOM indexes,
    // which causes drops to move the wrong (unrelated) accessory.
    if (this.manageLayoutMode) {
      return true
    }

    // Check hidden filter
    if (this.hideHidden() && service.hidden) {
      return false
    }

    // Check bridge filter
    if (service.instance?.username) {
      // Use custom name from mapping if available, otherwise fallback to instance.name
      const customName = this.bridgeUsernameToNameMap.get(service.instance.username)
      const bridgeName = customName || service.instance.name

      const selected = this.selectedBridges()

      // If not initialized yet, show all
      if (selected === null) {
        return true
      }

      // If no bridges selected, show nothing
      if (selected.length === 0) {
        return false
      }

      // Show only if bridge is in selected list
      if (bridgeName && !selected.includes(bridgeName)) {
        return false
      }
    }

    return true
  }

  /**
   * Toggle a bridge in the filter
   */
  public toggleBridge(bridgeName: string): void {
    // If in manage layout mode, start fresh with just this bridge selected
    if (this.manageLayoutMode) {
      this.selectedBridges.set([bridgeName])
      this.manageLayoutMode = false
      this.previousBridgeSelection = null

      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
      return
    }

    // Normal toggle behavior when not in manage layout mode
    const current = this.selectedBridges() ?? []
    const index = current.indexOf(bridgeName)
    if (index === -1) {
      this.selectedBridges.set([...current, bridgeName])
    } else {
      this.selectedBridges.set(current.filter((_, i) => i !== index))
    }

    if (!this.isMobile()) {
      this.toggleLayoutLock()
    }
  }

  /**
   * Check if a bridge is selected
   */
  public isBridgeSelected(bridgeName: string): boolean {
    // In manage layout mode, no bridges should show as selected
    if (this.manageLayoutMode) {
      return false
    }
    return this.selectedBridges()?.includes(bridgeName) ?? false
  }

  /**
   * Toggle between all bridges and no bridges
   */
  public clearBridgeFilter(): void {
    // If in manage layout mode, selecting "All Bridges" should select all
    if (this.manageLayoutMode) {
      this.selectedBridges.set([...this.availableBridges()])
      this.manageLayoutMode = false
      this.previousBridgeSelection = null

      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
      return
    }

    if (this.isShowingAllBridges) {
      // All bridges selected, so unselect everything
      this.selectedBridges.set([])
    } else {
      // Not all bridges selected, so select all
      this.selectedBridges.set([...this.availableBridges()])
    }

    if (!this.isMobile()) {
      this.toggleLayoutLock()
    }
  }

  /**
   * Check if all bridges are shown (all bridges selected)
   */
  public get isShowingAllBridges(): boolean {
    const selected = this.selectedBridges()
    const available = this.availableBridges()
    return selected !== null
      && selected.length === available.length
      && available.length > 0
      && !this.manageLayoutMode
  }

  /**
   * Toggle manage layout mode
   */
  public toggleManageLayout(): void {
    this.manageLayoutMode = !this.manageLayoutMode

    if (this.manageLayoutMode) {
      // Save current bridge selection
      const current = this.selectedBridges()
      this.previousBridgeSelection = current ? [...current] : null

      // Unlock layout
      if (this.isMobile()) {
        this.toggleLayoutLock()
      }
    } else {
      // Restore previous bridge selection when toggling off via the button
      this.selectedBridges.set(this.previousBridgeSelection ? [...this.previousBridgeSelection] : null)
      this.previousBridgeSelection = null

      // Lock layout when exiting manage mode
      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
    }
  }
}
