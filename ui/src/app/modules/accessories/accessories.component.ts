import { NgTemplateOutlet } from '@angular/common'
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle } from '@ng-bootstrap/ng-bootstrap/dropdown'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap/tooltip'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { DragulaModule, DragulaService } from 'ng2-dragula'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AccessoryTileComponent } from '@/app/core/accessories/accessory-tile/accessory-tile.component'
import { AuthService } from '@/app/core/auth/auth.service'
import { ApiService } from '@/app/core/communication/api.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { SpinnerComponent } from '@/app/core/components/spinner/spinner.component'
import { ChildBridgeStatusResponse } from '@/app/core/server.interfaces'
import { SettingsService } from '@/app/core/ui/settings.service'
import { MobileDetectService } from '@/app/core/utilities/mobile-detect.service'
import { AccessorySupportComponent } from '@/app/modules/accessories/accessory-support/accessory-support.component'
import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { DragHerePlaceholderComponent } from '@/app/modules/accessories/drag-here-placeholder/drag-here-placeholder.component'

@Component({
  selector: 'app-accessories',
  templateUrl: './accessories.component.html',
  styleUrls: ['./accessories.component.scss'],
  standalone: true,
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
    TranslatePipe,
    SpinnerComponent,
    FormsModule,
  ],
})
export class AccessoriesComponent implements OnInit, OnDestroy {
  protected $accessories = inject(AccessoriesService)

  private $api = inject(ApiService)
  private $auth = inject(AuthService)
  private dragulaService = inject(DragulaService)
  private $md = inject(MobileDetectService)
  private $modal = inject(NgbModal)
  private $settings = inject(SettingsService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private ioStatus: IoNamespace
  private ioChild: IoNamespace

  // Getter for persisted bridge name mapping from service
  private get bridgeUsernameToNameMap(): Map<string, string> {
    return this.$accessories.bridgeUsernameToNameMap
  }

  public isAdmin = this.$auth.user.admin
  public enableAccessories = this.$settings.env.enableAccessories
  public isMobile = signal<boolean | string>(false)
  public hideHidden = signal(true)
  public readonly linkInsecure = '<a href="https://github.com/homebridge/homebridge-config-ui-x/wiki/Enabling-Accessory-Control" target="_blank"><i class="fa fa-external-link-alt primary-text"></i></a>'
  public hasPlugins = signal(false)
  public loading = signal(true)
  public manageLayoutMode = false
  private previousBridgeSelection: string[] | null = null

  // Getters/setters for persisted properties from service (persist across navigation)
  public get availableBridges(): string[] {
    return this.$accessories.availableBridges
  }

  public set availableBridges(value: string[]) {
    this.$accessories.availableBridges = value
  }

  public get selectedBridges(): string[] | null {
    return this.$accessories.selectedBridges
  }

  public set selectedBridges(value: string[] | null) {
    this.$accessories.selectedBridges = value
  }

  /**
   * Computed property to check if filter UI should be shown
   */
  public get shouldShowFilters(): boolean {
    return this.hasPlugins() && !this.loading() && this.availableBridges.length > 0
  }

  // Getter/setter for dragula two-way binding
  public get rooms() {
    return this.$accessories.rooms()
  }

  public set rooms(value) {
    this.$accessories.rooms.set(value)
  }

  constructor() {
    const dragulaService = this.dragulaService

    this.isMobile.set(this.$md.detect.mobile())

    // Disable drag and drop for everything except the room title
    dragulaService.createGroup('rooms-bag', {
      moves: (_el, _container, handle) => !this.isMobile() && handle.classList.contains('drag-handle'),
    })

    // Disable drag and drop for the .no-drag class
    dragulaService.createGroup('services-bag', {
      moves: el => !this.isMobile() && !el.classList.contains('no-drag'),
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
    const title = this.$translate.instant('menu.label_accessories')
    this.$settings.setPageTitle(title)

    // Initialize selectedBridges if null or empty - default to showing all bridges
    if ((this.selectedBridges === null || this.selectedBridges.length === 0) && this.availableBridges.length > 0) {
      this.selectedBridges = [...this.availableBridges]
    }

    void this.$accessories.start()
    void this.checkForPlugins()

    // Set up WebSocket connections to get custom bridge names
    this.setupBridgeNameMapping()

    // Subscribe to accessory data to update available bridges
    this.$accessories.accessoryData.subscribe(() => {
      this.updateAvailableBridges()
    })
  }

  public async addRoom(): Promise<void> {
    const ref = this.$modal.open(AddRoomComponent, {
      size: 'lg',
      backdrop: 'static',
    })

    try {
      const roomName: string = await ref.result
      // No room name provided
      if (!roomName || !roomName.length) {
        return
      }

      // Duplicate room name
      if (this.$accessories.rooms().find(r => r.name === roomName)) {
        return
      }

      this.$accessories.rooms.update(current => [...current, {
        name: roomName,
        services: [],
      }])

      if (this.isMobile()) {
        this.toggleLayoutLock()
      }
    } catch {
      // Modal dismissed, do nothing
    }
  }

  public toggleLayoutLock(): void {
    this.isMobile.set(!this.isMobile())

    if (this.isMobile()) {
      const servicesBags = document.querySelectorAll('.services-bag')
      servicesBags.forEach((servicesBag) => {
        for (let i = 0; i < 10; i += 1) {
          const invisibleDiv = document.createElement('div')
          invisibleDiv.className = 'accessory-box invisible py-0 my-0'
          invisibleDiv.style.height = '0'
          servicesBag.appendChild(invisibleDiv)
        }
      })
    } else {
      const invisibleItems = document.querySelectorAll('.invisible')
      invisibleItems.forEach(item => item.remove())
    }
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
    this.dragulaService.destroy('rooms-bag')
    this.dragulaService.destroy('services-bag')

    // Clean up WebSocket connections
    this.ioStatus?.end()
    this.ioChild?.end()
  }

  private async checkForPlugins(): Promise<void> {
    try {
      const installedPlugins = await this.$api.get('/plugins')
      this.hasPlugins.set(installedPlugins.length > 1) // ignore the ui plugin
    } catch (error) {
      console.error(error)
      this.hasPlugins.set(true)
    } finally {
      this.loading.set(false)
    }
  }

  /**
   * Set up WebSocket connections to get custom bridge names from config
   */
  private setupBridgeNameMapping(): void {
    // Connect to status namespace for main Homebridge instance
    this.ioStatus = this.$ws.connectToNamespace('status')
    this.ioStatus.connected.subscribe(() => {
      this.ioStatus.socket.emit('monitor-server-status')
    })

    // Fallback for cached connections where the connected event fires before subscription
    if (this.ioStatus.socket.connected) {
      this.ioStatus.socket.emit('monitor-server-status')
    }

    this.ioStatus.socket.on('homebridge-status', (data: any) => {
      if (data.username) {
        this.bridgeUsernameToNameMap.set(data.username, 'Homebridge')
      }
    })

    // Connect to child-bridges namespace for child bridge instances
    this.ioChild = this.$ws.connectToNamespace('child-bridges')
    this.ioChild.connected.subscribe(() => {
      this.ioChild.socket.emit('monitor-child-bridge-status')
      this.fetchChildBridges()
    })

    // Fallback for cached connections where the connected event fires before subscription
    if (this.ioChild.socket.connected) {
      this.ioChild.socket.emit('monitor-child-bridge-status')
      this.fetchChildBridges()
    }

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

    const newBridges = Array.from(bridges).sort((a, b) => {
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
    const shouldUpdate = JSON.stringify(newBridges) !== JSON.stringify(this.availableBridges)
      && newBridges.length >= this.availableBridges.length

    if (shouldUpdate) {
      if (this.selectedBridges === null || this.selectedBridges.length === 0) {
        // First initialization or no bridges selected - select all bridges by default
        this.selectedBridges = [...newBridges]
      } else {
        // Check if we were showing all bridges before the update
        const wasShowingAll = this.selectedBridges.length === this.availableBridges.length
          && this.availableBridges.length > 0

        if (wasShowingAll) {
          // If showing all, keep showing all even when new bridges appear
          this.selectedBridges = [...newBridges]
        } else {
          // Remove any selected bridges that no longer exist, but don't add new ones
          this.selectedBridges = this.selectedBridges.filter(bridge => newBridges.includes(bridge))
        }
      }

      // Update available bridges after handling selection
      this.availableBridges = newBridges
    }
  }

  /**
   * Check if a service should be displayed based on current filters
   */
  public shouldDisplayService(service: ServiceTypeX): boolean {
    // Check hidden filter
    if (this.hideHidden() && service.hidden) {
      return false
    }

    // In manage layout mode, show all accessories regardless of bridge filter
    if (this.manageLayoutMode) {
      return true
    }

    // Check bridge filter
    if (service.instance?.username) {
      // Use custom name from mapping if available, otherwise fallback to instance.name
      const customName = this.bridgeUsernameToNameMap.get(service.instance.username)
      const bridgeName = customName || service.instance.name

      // If not initialized yet, show all
      if (this.selectedBridges === null) {
        return true
      }

      // If no bridges selected, show nothing
      if (this.selectedBridges.length === 0) {
        return false
      }

      // Show only if bridge is in selected list
      if (bridgeName && !this.selectedBridges.includes(bridgeName)) {
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
      this.selectedBridges = [bridgeName]
      this.manageLayoutMode = false
      this.previousBridgeSelection = null

      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
      return
    }

    // Normal toggle behavior when not in manage layout mode
    if (!this.selectedBridges) {
      this.selectedBridges = []
    }

    const index = this.selectedBridges.indexOf(bridgeName)
    if (index === -1) {
      this.selectedBridges.push(bridgeName)
    } else {
      this.selectedBridges.splice(index, 1)
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
    return this.selectedBridges?.includes(bridgeName) ?? false
  }

  /**
   * Toggle between all bridges and no bridges
   */
  public clearBridgeFilter(): void {
    // If in manage layout mode, selecting "All Bridges" should select all
    if (this.manageLayoutMode) {
      this.selectedBridges = [...this.availableBridges]
      this.manageLayoutMode = false
      this.previousBridgeSelection = null

      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
      return
    }

    // Normal toggle behavior when not in manage layout mode
    // Initialize if null
    if (this.selectedBridges === null) {
      this.selectedBridges = []
    }

    if (this.isShowingAllBridges) {
      // All bridges selected, so unselect everything
      this.selectedBridges = []
    } else {
      // Not all bridges selected, so select all
      this.selectedBridges = [...this.availableBridges]
    }

    if (!this.isMobile()) {
      this.toggleLayoutLock()
    }
  }

  /**
   * Check if all bridges are shown (all bridges selected)
   */
  public get isShowingAllBridges(): boolean {
    return this.selectedBridges !== null
      && this.selectedBridges.length === this.availableBridges.length
      && this.availableBridges.length > 0
      && !this.manageLayoutMode
  }

  /**
   * Toggle manage layout mode
   */
  public toggleManageLayout(): void {
    this.manageLayoutMode = !this.manageLayoutMode

    if (this.manageLayoutMode) {
      // Save current bridge selection
      this.previousBridgeSelection = this.selectedBridges ? [...this.selectedBridges] : null

      // Unlock layout
      if (this.isMobile()) {
        this.toggleLayoutLock()
      }
    } else {
      // Restore previous bridge selection when toggling off via the button
      this.selectedBridges = this.previousBridgeSelection ? [...this.previousBridgeSelection] : null
      this.previousBridgeSelection = null

      // Lock layout when exiting manage mode
      if (!this.isMobile()) {
        this.toggleLayoutLock()
      }
    }
  }
}
