import type { ServiceType } from '@homebridge/hap-client'

import { createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom, Subject } from 'rxjs'
import { takeUntil, timeout } from 'rxjs/operators'

import { AccessoryLayout, AccessoryLayoutService, ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { attachControlHelpers } from '@/app/core/accessories/accessory-control'
import { AccessoryInfoComponent } from '@/app/core/accessories/accessory-info/accessory-info.component'
import { AccessoryFilterState, AccessoryFloor, DEFAULT_FILTER_STATE, FilterContext } from '@/app/core/accessories/filters/accessory-filters'
import { AuthService } from '@/app/core/auth/auth.service'
import { CachedAccessoriesCacheService } from '@/app/core/caching/cached-accessories-cache.service'
import { ServerPairingsCacheService } from '@/app/core/caching/server-pairings-cache.service'
import { IoNamespace, WsService } from '@/app/core/communication/ws.service'
import { ACCESSORY_INFO_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'

/** localStorage key for the accessories page filter, grouping and sort */
const FILTER_STORAGE_KEY = 'accessories-filter-v1'
/** Quiet time after the last label or floor change before they are sent */
const METADATA_SAVE_DELAY = 300
/** How long to wait for `get-metadata` before giving up on the saved labels and floors */
const METADATA_LOAD_TIMEOUT = 10000

@Injectable({
  providedIn: 'root',
})
export class AccessoriesService {
  private injector = inject(EnvironmentInjector)
  private $accessoryCache = inject(CachedAccessoriesCacheService)
  private $pairingsCache = inject(ServerPairingsCacheService)
  private $auth = inject(AuthService)
  private $destroyRef = inject(DestroyRef)
  private $errors = inject(HttpErrorService)
  private $modal = inject(NgbModal)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $ws = inject(WsService)
  private accessoryCache: any[] = []
  private pairingCache: any[] = []
  private customAttributesApplied = new Set<string>()
  private combinedServiceIds = new Set<string>()
  // Layout entry -> uniqueId of the discovered service it was given to, so one
  // saved entry can never supply custom attributes to two live services
  private layoutClaims = new Map<AccessoryLayoutService, string>()
  // nameBasedUniqueIds that more than one saved entry shares
  private ambiguousNameIds = new Set<string>()
  private io!: IoNamespace
  private stop$ = new Subject<void>()
  // True between `start()` and `stop()`. Guards the `accessories-data` handler
  // so an in-flight payload landing after a session stops can't push stale
  // services to subscribers.
  private sessionActive = false
  private socketHandlers: Array<[string, (...args: any[]) => void]> = []
  private hiddenTypes = new Set([
    'InputSource',
    'LockManagement',
    // A camera's recording plumbing, which has nothing to show. Its video stream is the
    // camera's own tile - see attachPartsToCamera()
    'CameraRecordingManagement',
    'CameraOperatingMode',
    'DataStreamTransportManagement',
    'ProtocolInformation',
    'NFCAccess',
    'BridgedNode',
    'History', // Eve History
  ])

  private metadataSaveTimer: ReturnType<typeof setTimeout> | null = null
  // Saves are held back until the saved labels and floors have loaded, so a failed load can never
  // overwrite what the server holds with an empty list
  private metadataLoaded = false

  public layoutSaved = new Subject()
  public metadataSaved = new Subject<void>()
  public accessoryData = new Subject()
  public hapReadyForControl = false
  public matterReadyForControl = false
  public accessories: { services: ServiceType[] } = { services: [] }
  public accessoryLayout!: AccessoryLayout
  private originalLayout!: AccessoryLayout
  public readonly availableBridges = signal<string[]>([])
  /** Filter, grouping and sort for the accessories page. Lives here so it survives navigation. */
  public readonly filterState = signal<AccessoryFilterState>(this.loadFilterState())
  public readonly rooms = signal<Array<{
    name: string
    isDefault?: boolean
    services: ServiceTypeX[]
  }>>([])

  /** uniqueId -> labels for each accessory that has any */
  public readonly labels = signal<Record<string, string[]>>({})
  /** Floors, each with the rooms on it */
  public readonly floors = signal<AccessoryFloor[]>([])

  constructor() {
    if (this.$auth.user.admin) {
      void this.loadCachedData()
    }
  }

  private async loadCachedData(): Promise<void> {
    // Show a single toast on first failure rather than per-cache, so a
    // backend that's down across the board doesn't fire two error toasts
    // in a row. Failures here mean the Accessory Info modal will be
    // missing data — without surfacing it, the user just sees a blank
    // panel and assumes the feature is broken.
    let surfaced = false
    const handle = (error: any) => {
      console.error(error)
      if (!surfaced) {
        surfaced = true
        this.$toastr.warning(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_warning'))
      }
    }

    try {
      this.accessoryCache = await this.$accessoryCache.getHap()
    } catch (error) {
      handle(error)
    }

    try {
      this.pairingCache = await this.$pairingsCache.get()
    } catch (error) {
      handle(error)
    }
  }

  public async showAccessoryInformation(service: ServiceTypeX): Promise<boolean> {
    const injector = createEnvironmentInjector([
      {
        provide: ACCESSORY_INFO_MODAL_DATA,
        useValue: {
          service,
          accessoryCache: this.accessoryCache,
          pairingCache: this.pairingCache,
        },
      },
    ], this.injector)

    const ref = this.$modal.open(AccessoryInfoComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })

    try {
      const result = await ref.result

      // Apply saved values to the current service object in the room.
      // The original service reference may have been replaced by an accessories-data
      // event during the modal close animation, so find the current one by uniqueId.
      const currentService = this.rooms()
        .flatMap(r => r.services)
        .find(s => s.uniqueId === service.uniqueId) as ServiceTypeX | undefined

      const target = currentService || service

      // Build a NEW service object carrying the saved values rather than mutating
      // `target` in place. The accessory tile is OnPush with a signal `input()`, so
      // re-emitting the rooms array while the service keeps the same reference only
      // re-checks the page — not the tile. The custom type (and therefore the icon)
      // would stay stale until the next live data event or a manual page refresh.
      // Swapping in a fresh reference changes the tile's input identity and forces it
      // to re-render now.
      const updated = {
        ...target,
        customName: result.customName,
        customType: result.customType,
        hidden: result.hidden,
        onDashboard: result.onDashboard,
      } as ServiceTypeX

      // Keep the flat accessories list in sync so later parses/refreshes build on the
      // new reference instead of resurrecting the stale one.
      const flatIndex = this.accessories.services.findIndex(s => s.uniqueId === updated.uniqueId)
      if (flatIndex !== -1) {
        this.accessories.services[flatIndex] = updated
      }

      // Replace the service reference inside the rooms signal so the OnPush tile re-renders.
      this.rooms.update(rooms => rooms.map(room => ({
        ...room,
        services: room.services.map(s => (s.uniqueId === updated.uniqueId
          ? updated
          : s)),
      })))

      // A room picked in the modal is applied on Save, here, so the move and the
      // field changes above go out in the same single save
      if (result.room) {
        this.addRoom(result.room)
        this.moveServiceInLayout(updated.uniqueId ?? '', result.room)
      }

      this.saveLayout()

      // Labels are staged in the modal too, and go out with the same Save
      if (Array.isArray(result.labels)) {
        this.setLabels(updated.uniqueId ?? '', result.labels)
      }
    } catch {
      // Modal dismissed - do not save
    }

    return false
  }

  /**
   * Stop the accessory control session
   */
  /** Whether a session is running on this page (between start() and stop()) */
  public get sessionRunning(): boolean {
    return this.sessionActive
  }

  public stop() {
    // Complete all subscriptions
    this.stop$.next()
    this.stop$.complete()

    // Send any labels or floors still waiting out their debounce while the socket is open
    this.flushMetadataSave()

    // Mark the session inactive so any in-flight `accessories-data` event that
    // lands between `io.end()` and the socket actually closing is dropped
    // instead of pushing stale services to subscribers.
    //
    // The public `accessoryData`/`layoutSaved` Subjects are deliberately NOT
    // completed/reassigned here. This service is a root singleton and its
    // consumers (accessories page, control modal, dashboard widget) subscribe
    // once via `takeUntilDestroyed` and never re-subscribe. Completing the
    // Subjects on stop killed those subscriptions on the first
    // `accessories-reload-required` reload, so a late-discovered bridge was
    // sorted into the rooms but never re-added to the bridge filter — hiding
    // the whole bridge until a manual page refresh.
    this.sessionActive = false

    // The namespace is cached and shared, and `end()` only emits `end`: the handlers start() added must be taken
    // off here, or every visit adds one more set (N toasts for one failure, N reloads for one new bridge)
    for (const [event, handler] of this.socketHandlers) {
      this.io?.socket?.off(event, handler)
    }
    this.socketHandlers = []

    this.io?.end?.()
    this.rooms.set([])
    this.accessories = { services: [] }
    this.customAttributesApplied.clear()
    this.combinedServiceIds.clear()
    this.layoutClaims.clear()
    this.ambiguousNameIds.clear()
    this.accessoryLayout = undefined as any
    this.originalLayout = undefined as any
    this.labels.set({})
    this.floors.set([])
    this.metadataLoaded = false

    // Reset the internal unsubscribe channel for the next session. The public
    // Subjects persist for the lifetime of this singleton service.
    this.stop$ = new Subject<void>()
  }

  /**
   * Add a socket handler for this session; stop() takes it off again
   */
  private listen(event: string, handler: (...args: any[]) => void) {
    this.socketHandlers.push([event, handler])
    this.io.socket.on(event, handler)
  }

  /**
   * Start the accessory control session
   */
  public async start() {
    this.hapReadyForControl = false
    this.matterReadyForControl = false
    this.sessionActive = true

    // Connect to the socket endpoint
    this.io = this.$ws.connectToNamespace('accessories')

    // Load the room layout first
    await this.loadLayout()

    // Subscribe for reconnections — ReplaySubject(1) on `connected` ensures this
    // fires both for fresh connections and when the namespace is reused while
    // already connected, so no synchronous fallback is needed.
    this.io.connected!
      .pipe(takeUntil(this.stop$))
      .subscribe(() => {
        this.io.socket.emit('get-accessories')
      })

    // Subscribe to accessory events
    this.listen('accessories-data', (data: ServiceType[]) => {
      // Drop events that arrive after the session was stopped (e.g. an
      // in-flight payload landing between `stop()` and the socket closing).
      if (!this.sessionActive) {
        return
      }
      this.parseServices(data)
      this.combineRelatedServices()
      this.generateHelpers()
      this.sortIntoRooms()

      // Always order rooms to handle accessories that arrive late (e.g., Matter accessories)
      this.orderRooms()

      // In zoneless Angular, mutating service objects doesn't trigger change detection
      // We need to create new object references for the rooms signal to detect changes
      this.refreshRoomsForChangeDetection()

      // Apply custom attributes after refreshing room references
      // This ensures attributes are applied to the new service objects, not the old ones
      this.applyCustomAttributes()

      this.accessoryData.next(data)
    })

    // When a new instance is discovered, reload accessory data over the
    // existing socket instead of tearing the session down and back up.
    // A full stop()/start() re-binds every socket handler on the cached
    // socket (the previous handlers are never removed), so each reload
    // doubled the live listeners — and because each fired another reload, the
    // count grew with every late-discovered bridge. Re-fetching in place keeps
    // the single set of handlers; parseServices() merges the new bridge in.
    this.listen('accessories-reload-required', () => {
      this.io.socket.emit('accessory-control', { refresh: true })
    })

    // When only Matter accessories need to reload
    this.listen('matter-accessories-reload-required', async () => {
      // Trigger reload by emitting accessory-control-refresh
      // This will reload accessories from the backend without full reconnection
      this.matterReadyForControl = false
      this.io.socket.emit('accessory-control', { refresh: true })
    })

    this.listen('accessory-control-failure', (message: string) => {
      console.error(message)
      this.$toastr.error(message, this.$translate.instant('toast.title_error'))
    })

    // Protocol-specific ready events
    this.listen('hap-accessories-ready-for-control', () => {
      this.hapReadyForControl = true
    })

    this.listen('matter-accessories-ready-for-control', () => {
      this.matterReadyForControl = true
    })

    await this.loadMetadata()
  }

  /**
   * The name of the room a service currently sits in, or undefined if it is in none
   */
  public getRoomNameForService(uniqueId: string): string | undefined {
    return this.rooms().find(room => room.services.some(service => service.uniqueId === uniqueId))?.name
  }

  /**
   * Set the page filter. Pass persist = false to change it for this visit only,
   * for example while manage-layout mode forces the default filter.
   */
  public setFilterState(state: AccessoryFilterState, persist = true): void {
    this.filterState.set(state)
    if (!persist) {
      return
    }
    try {
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable (private window or blocked): the filter still works for this visit
    }
  }

  private loadFilterState(): AccessoryFilterState {
    try {
      const raw = localStorage.getItem(FILTER_STORAGE_KEY)
      if (raw) {
        return {
          ...DEFAULT_FILTER_STATE,
          ...JSON.parse(raw),
        }
      }
    } catch {
      // Corrupt or unavailable storage: start from the defaults
    }
    return { ...DEFAULT_FILTER_STATE }
  }

  /**
   * Move a service to the end of another room, then save the layout.
   * The service object itself is moved, so its custom fields come with it.
   * Does nothing if the service or room is unknown, or it is already in that room.
   */
  public moveServiceToRoom(uniqueId: string, roomName: string): void {
    if (this.moveServiceInLayout(uniqueId, roomName)) {
      this.saveLayout()
    }
  }

  /**
   * Move several services to another room, then save the layout once.
   * Services that are unknown or already in that room are skipped.
   */
  public moveServicesToRoom(uniqueIds: string[], roomName: string): void {
    let moved = false
    for (const uniqueId of uniqueIds) {
      moved = this.moveServiceInLayout(uniqueId, roomName) || moved
    }
    if (moved) {
      this.saveLayout()
    }
  }

  /**
   * Place a service in a room by uniqueId, then save the layout once. The room's FULL services
   * list is used: before `beforeUniqueId` if it is given and present, else right after
   * `afterUniqueId` if that is given and present, else at the end. Services hidden by a filter
   * keep their places. Does nothing if nothing changes.
   */
  public placeService(uniqueId: string, targetRoom: string, beforeUniqueId: string | null, afterUniqueId: string | null): void {
    const current = this.rooms()
    const source = current.find(room => room.services.some(service => service.uniqueId === uniqueId))
    const target = current.find(room => room.name === targetRoom)
    if (!source || !target) {
      return
    }

    const service = source.services.find(entry => entry.uniqueId === uniqueId)!
    const sourceServices = source.services.filter(entry => entry.uniqueId !== uniqueId)
    const base = source === target
      ? sourceServices
      : target.services
    const insertAt = this.insertIndex(base.map(entry => entry.uniqueId ?? ''), beforeUniqueId, afterUniqueId)
    const targetServices = [
      ...base.slice(0, insertAt),
      service,
      ...base.slice(insertAt),
    ]

    if (source === target && targetServices.every((entry, index) => entry === target.services[index])) {
      return
    }

    this.rooms.set(current.map((room) => {
      if (room === target) {
        return {
          ...room,
          services: targetServices,
        }
      }
      if (room === source) {
        return {
          ...room,
          services: sourceServices,
        }
      }
      return { ...room }
    }))
    this.saveLayout()
  }

  /**
   * Place a room by name, then save the layout once. Uses the FULL rooms list with the same
   * before/after/end rule as placeService. Rooms hidden by a filter keep their relative order.
   * The default room flag is kept. Does nothing if nothing changes.
   */
  public placeRoom(roomName: string, beforeRoomName: string | null, afterRoomName: string | null): void {
    const current = this.rooms()
    const from = current.findIndex(room => room.name === roomName)
    if (from === -1) {
      return
    }

    const moving = current[from]
    const rest = current.filter((_, index) => index !== from)
    const insertAt = this.insertIndex(rest.map(room => room.name), beforeRoomName, afterRoomName)
    const reordered = [
      ...rest.slice(0, insertAt),
      moving,
      ...rest.slice(insertAt),
    ]

    if (reordered.every((room, index) => room === current[index])) {
      return
    }

    this.rooms.set(reordered.map(room => ({ ...room })))
    this.saveLayout()
  }

  /**
   * Index to insert at in a list of keys: before `before` if present, else after `after` if present,
   * else the end.
   */
  private insertIndex(keys: string[], before: string | null, after: string | null): number {
    if (before !== null && keys.includes(before)) {
      return keys.indexOf(before)
    }
    if (after !== null && keys.includes(after)) {
      return keys.indexOf(after) + 1
    }
    return keys.length
  }

  /**
   * The move itself, without saving. Returns whether the service moved.
   */
  private moveServiceInLayout(uniqueId: string, roomName: string): boolean {
    const current = this.rooms()
    const source = current.find(room => room.services.some(service => service.uniqueId === uniqueId))
    const target = current.find(room => room.name === roomName)
    if (!source || !target || source.name === target.name) {
      return false
    }

    const service = source.services.find(entry => entry.uniqueId === uniqueId)!
    this.rooms.set(current.map((room) => {
      if (room === source) {
        return {
          ...room,
          services: room.services.filter(entry => entry.uniqueId !== uniqueId),
        }
      }
      if (room === target) {
        return {
          ...room,
          services: [...room.services, service],
        }
      }
      return { ...room }
    }))

    return true
  }

  /**
   * Add an empty room. Returns false, and adds nothing, if the trimmed name is blank
   * or matches an existing room case-insensitively. The layout is saved by the next move.
   */
  public addRoom(name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed) {
      return false
    }

    const lowered = trimmed.toLowerCase()
    if (this.rooms().some(room => room.name.trim().toLowerCase() === lowered)) {
      return false
    }

    this.rooms.update(current => [
      ...current,
      { name: trimmed, isDefault: false, services: [] },
    ])
    return true
  }

  /**
   * Load the saved labels and floors. A failure leaves them empty and blocks saving,
   * so the page still works without them.
   */
  private async loadMetadata(): Promise<void> {
    try {
      const payload = await firstValueFrom(this.io.request('get-metadata').pipe(timeout(METADATA_LOAD_TIMEOUT)))
      if (!payload || typeof payload !== 'object') {
        throw new Error('No saved metadata in the reply')
      }
      this.labels.set(payload.labels && typeof payload.labels === 'object'
        ? payload.labels
        : {})
      this.floors.set(Array.isArray(payload.floors)
        ? payload.floors
        : [])
      this.metadataLoaded = true
    } catch (error) {
      console.warn('Could not load saved accessory metadata:', error)
      this.labels.set({})
      this.floors.set([])
      this.metadataLoaded = false
    }
  }

  /**
   * Save labels and floors after a short quiet time, so a burst of changes is one request
   */
  public saveMetadata(): void {
    if (this.metadataSaveTimer !== null) {
      clearTimeout(this.metadataSaveTimer)
    }
    this.metadataSaveTimer = setTimeout(() => {
      this.metadataSaveTimer = null
      this.saveMetadataNow()
    }, METADATA_SAVE_DELAY)
  }

  /** Send any save still waiting out its quiet time, now */
  private flushMetadataSave(): void {
    if (this.metadataSaveTimer !== null) {
      clearTimeout(this.metadataSaveTimer)
      this.metadataSaveTimer = null
      this.saveMetadataNow()
    }
  }

  /**
   * Send the labels and floors
   */
  private saveMetadataNow(): void {
    if (!this.sessionActive || !this.metadataLoaded) {
      return
    }

    this.io.request('save-metadata', {
      labels: this.labels(),
      floors: this.floors(),
    })
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe({
        next: () => this.metadataSaved.next(),
        error: (error) => {
          console.error(error)
          this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        },
      })
  }

  /**
   * The labels and floors as a filter context, for matching and grouping
   */
  public filterContext(): FilterContext {
    return {
      labels: new Map(Object.entries(this.labels())),
      floors: this.floors(),
    }
  }

  /**
   * Set an accessory's labels. Blank and repeated labels are dropped. Nothing is sent if nothing changed.
   */
  public setLabels(uniqueId: string, labels: string[]): void {
    if (!uniqueId) {
      return
    }

    const cleaned = [
      ...new Set(labels.map(label => label.trim()).filter(label => label !== '')),
    ]
    const current = this.labels()
    if (JSON.stringify(current[uniqueId] ?? []) === JSON.stringify(cleaned)) {
      return
    }

    const next = { ...current }
    if (cleaned.length) {
      next[uniqueId] = cleaned
    } else {
      delete next[uniqueId]
    }
    this.labels.set(next)
    this.saveMetadata()
  }

  /**
   * Put a room on a floor, or on none (null). It leaves any other floor it was on.
   * A floor name that does not exist yet is created.
   */
  public setRoomFloor(room: string, floor: string | null): void {
    const name = floor?.trim() ?? ''
    const before = JSON.stringify(this.floors())

    let floors = this.floors().map(entry => ({
      ...entry,
      rooms: entry.rooms.filter(existing => existing !== room),
    }))

    if (name) {
      const lowered = name.toLowerCase()
      const existing = floors.find(entry => entry.name.toLowerCase() === lowered)
      if (existing) {
        floors = floors.map(entry => entry === existing
          ? {
              ...entry,
              rooms: [...entry.rooms, room],
            }
          : entry)
      } else {
        floors = [
          ...floors,
          {
            name,
            rooms: [room],
          },
        ]
      }
    }

    if (JSON.stringify(floors) === before) {
      return
    }
    this.floors.set(floors)
    this.saveMetadata()
  }

  /** Add an empty floor. Returns false for a blank or a duplicate name. */
  public addFloor(name: string): boolean {
    const trimmed = name.trim()
    const lowered = trimmed.toLowerCase()
    if (!trimmed || this.floors().some(entry => entry.name.toLowerCase() === lowered)) {
      return false
    }

    this.floors.update(current => [
      ...current,
      {
        name: trimmed,
        rooms: [],
      },
    ])
    this.saveMetadata()
    return true
  }

  /** Rename a floor. Returns false for a blank name, an unknown floor, or a name another floor has. */
  public renameFloor(from: string, to: string): boolean {
    const trimmed = to.trim()
    const lowered = trimmed.toLowerCase()
    if (!trimmed || !this.floors().some(entry => entry.name === from)) {
      return false
    }
    if (trimmed !== from && this.floors().some(entry => entry.name.toLowerCase() === lowered)) {
      return false
    }

    this.floors.update(current => current.map(entry => entry.name === from
      ? {
          ...entry,
          name: trimmed,
        }
      : entry))
    this.saveMetadata()
    return true
  }

  /** Delete a floor. Its rooms stay where they are, on no floor. */
  public deleteFloor(name: string): boolean {
    if (!this.floors().some(entry => entry.name === name)) {
      return false
    }
    this.floors.update(current => current.filter(entry => entry.name !== name))
    this.saveMetadata()
    return true
  }

  /** Follow a room rename into the floors */
  public renameRoomInFloors(from: string, to: string): void {
    if (from === to) {
      return
    }
    const before = JSON.stringify(this.floors())
    this.floors.update(current => current.map(entry => ({
      ...entry,
      rooms: entry.rooms.map(room => room === from
        ? to
        : room),
    })))
    if (JSON.stringify(this.floors()) !== before) {
      this.saveMetadata()
    }
  }

  /** Follow a room delete into the floors */
  public removeRoomFromFloors(room: string): void {
    const before = JSON.stringify(this.floors())
    this.floors.update(current => current.map(entry => ({
      ...entry,
      rooms: entry.rooms.filter(existing => existing !== room),
    })))
    if (JSON.stringify(this.floors()) !== before) {
      this.saveMetadata()
    }
  }

  /**
   * Save the room layout
   */
  public saveLayout() {
    // After stop() the rooms are empty and the saved layout is gone, so a save from a modal that is still open
    // (opened on the page, then the user went Back) would write an empty layout and wipe every room for the user
    if (!this.sessionActive || !this.originalLayout) {
      return
    }

    // Generate layout schema from currently active rooms
    const currentLayout = this.rooms().map(room => ({
      name: room.name,
      isDefault: room.isDefault,
      services: room.services.map(service => ({
        uniqueId: service.uniqueId,
        nameBasedUniqueId: service.nameBasedUniqueId || undefined,
        name: service.serviceName,
        serial: service.accessoryInformation?.['Serial Number'],
        bridge: service.instance?.username,
        aid: service.aid,
        iid: service.iid,
        uuid: service.uuid,
        customName: (service as ServiceTypeX).customName || undefined,
        customType: (service as ServiceTypeX).customType || undefined,
        hidden: (service as ServiceTypeX).hidden || undefined,
        onDashboard: (service as ServiceTypeX).onDashboard || undefined,
      })),
    }))

    // Ensure at least one room has isDefault: true
    const hasDefaultRoom = currentLayout.some(r => r.isDefault === true)
    if (!hasDefaultRoom && currentLayout.length > 0) {
      currentLayout[0].isDefault = true
    }

    // Merge with undiscovered services from original layout to preserve custom information
    // This will add back rooms that exist in the original layout even if they have no discovered services
    this.setLayout(this.mergeWithUndiscoveredServices(currentLayout as AccessoryLayout))

    // The merged layout starts with one entry per live service, room by room
    // and in order, so hand each of those entries straight back to its service
    const rooms = this.rooms()
    this.accessoryLayout.forEach((room, roomIndex) => {
      rooms[roomIndex]?.services.forEach((service, serviceIndex) => {
        this.layoutClaims.set(room.services[serviceIndex], service.uniqueId!)
      })
    })

    // Send update request to server
    this.io.request('save-layout', { user: this.$auth.user.username, layout: this.accessoryLayout })
      .pipe(
        takeUntil(this.stop$),
        takeUntilDestroyed(this.$destroyRef),
      )
      .subscribe({
        next: () => this.layoutSaved.next(undefined),
        error: (error) => {
          console.error(error)
          this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
        },
      })
  }

  /**
   * Load the room layout
   */
  private async loadLayout() {
    this.setLayout(await firstValueFrom(this.io.request('get-layout', { user: this.$auth.user.username })))

    // Store original layout to preserve undiscovered services
    this.originalLayout = JSON.parse(JSON.stringify(this.accessoryLayout))

    // Backward compatibility: Ensure at least one room has isDefault flag
    const hasDefaultRoom = this.accessoryLayout.some(r => r.isDefault)
    if (!hasDefaultRoom && this.accessoryLayout.length > 0) {
      // Find room named "Default Room" or use first room
      const defaultRoomIndex = this.accessoryLayout.findIndex(r => r.name === 'Default Room')
      const indexToMakeDefault = defaultRoomIndex !== -1
        ? defaultRoomIndex
        : 0
      this.accessoryLayout[indexToMakeDefault].isDefault = true
    }

    // Build empty room layout
    this.rooms.set(this.accessoryLayout.map(room => ({
      name: room.name,
      isDefault: room.isDefault,
      services: [] as ServiceTypeX[],
    })))
  }

  /**
   * Replace the working layout, re-indexing what matching depends on
   */
  private setLayout(layout: AccessoryLayout) {
    this.accessoryLayout = layout
    this.layoutClaims.clear()
    this.ambiguousNameIds = this.findAmbiguousNameIds(layout)
  }

  /**
   * The nameBasedUniqueIds that more than one entry in a layout shares
   */
  private findAmbiguousNameIds(layout: AccessoryLayout): Set<string> {
    const seen = new Set<string>()
    const ambiguous = new Set<string>()
    for (const service of layout.flatMap(room => room.services)) {
      if (service.nameBasedUniqueId) {
        if (seen.has(service.nameBasedUniqueId)) {
          ambiguous.add(service.nameBasedUniqueId)
        }
        seen.add(service.nameBasedUniqueId)
      }
    }
    return ambiguous
  }

  /**
   * A serial number that identifies the physical device, or undefined when the
   * plugin left it empty or at the HAP default every accessory shares
   */
  private deviceSerial(serial: string | undefined): string | undefined {
    return serial && serial !== 'Default-SerialNumber'
      ? serial
      : undefined
  }

  /**
   * Check if a cached service matches a discovered service.
   *
   * Matching priority:
   * 1. nameBasedUniqueId (stable across sessions, available from hap-client), when
   *    the serial numbers agree, or when one of them does not identify the device and
   *    no other saved entry shares the same nameBasedUniqueId
   * 2. uniqueId (stable within a session, may change between sessions)
   * 3. Fallback: name + serial + bridge + uuid (legacy layouts without nameBasedUniqueId)
   *
   * nameBasedUniqueId only hashes the bridge, manufacturer and service name, so
   * two plugs that each expose an "Outlet 1" share it. Serial numbers tell them apart:
   * two real serial numbers that differ never match, whatever the other ids say.
   *
   * Matter accessories use uniqueId + bridge matching only.
   */
  private servicesMatch(cachedService: AccessoryLayoutService, discoveredService: any, ambiguousNameIds = this.ambiguousNameIds): boolean {
    const isMatterAccessory = discoveredService.protocol === 'matter' || discoveredService.uniqueId?.startsWith('matter:')
    if (isMatterAccessory) {
      return cachedService.uniqueId === discoveredService.uniqueId
        && cachedService.bridge === (discoveredService.instance?.username || discoveredService.bridge)
    }

    const bridge = discoveredService.instance?.username || discoveredService.bridge
    if (cachedService.bridge !== bridge) {
      return false
    }

    const serial = discoveredService.accessoryInformation?.['Serial Number'] || discoveredService.serial
    const cachedDeviceSerial = this.deviceSerial(cachedService.serial)
    const discoveredDeviceSerial = this.deviceSerial(serial)
    const serialsKnown = !!cachedDeviceSerial && !!discoveredDeviceSerial
    if (serialsKnown && cachedDeviceSerial !== discoveredDeviceSerial) {
      // A different serial number is a different device
      return false
    }
    const sameUniqueId = !!cachedService.uniqueId && cachedService.uniqueId === discoveredService.uniqueId

    if (cachedService.nameBasedUniqueId && discoveredService.nameBasedUniqueId) {
      if (cachedService.nameBasedUniqueId !== discoveredService.nameBasedUniqueId) {
        return false
      }
      return serialsKnown || !ambiguousNameIds.has(cachedService.nameBasedUniqueId) || sameUniqueId
    }

    if (sameUniqueId) {
      return true
    }

    return cachedService.name === (discoveredService.serviceName || discoveredService.name)
      && cachedService.serial === serial
      && cachedService.uuid === discoveredService.uuid
  }

  /**
   * Find a cached service in the layout that matches a discovered service.
   * Returns the cached service and the room it belongs to, or null if not found.
   *
   * Each saved entry goes to at most one discovered service: the first to match
   * claims it, and keeps it on later events.
   */
  private findInLayout(service: ServiceType): { room: AccessoryLayout[number], service: AccessoryLayoutService } | null {
    for (const room of this.accessoryLayout) {
      for (const cachedService of room.services) {
        if (this.layoutClaims.get(cachedService) === service.uniqueId) {
          return { room, service: cachedService }
        }
      }
    }

    for (const room of this.accessoryLayout) {
      for (const cachedService of room.services) {
        if (!cachedService.name || this.layoutClaims.has(cachedService)) {
          continue
        }
        if (this.servicesMatch(cachedService, service)) {
          this.layoutClaims.set(cachedService, service.uniqueId!)
          return { room, service: cachedService }
        }
      }
    }
    return null
  }

  /**
   * Merge current layout with undiscovered services to preserve custom information
   */
  private mergeWithUndiscoveredServices(currentLayout: AccessoryLayout): AccessoryLayout {
    if (!this.originalLayout) {
      return currentLayout
    }

    // Create the merged layout starting with current rooms
    const mergedLayout: AccessoryLayout = JSON.parse(JSON.stringify(currentLayout))

    // First pass: pair each discovered service with at most one original entry
    const originalServices = this.originalLayout.flatMap(room => room.services).filter(service => service.name)
    const matchedOriginals = new Set<AccessoryLayoutService>()
    const ambiguousNameIds = this.findAmbiguousNameIds(this.originalLayout)
    for (const room of mergedLayout) {
      for (const discoveredService of room.services) {
        const original = originalServices.find(originalService =>
          !matchedOriginals.has(originalService) && this.servicesMatch(originalService, discoveredService, ambiguousNameIds))
        if (original) {
          matchedOriginals.add(original)
        }
      }
    }

    // Second pass: add unmatched services from original layout (truly undiscovered services)
    for (const originalRoom of this.originalLayout) {
      for (const originalService of originalRoom.services) {
        if (matchedOriginals.has(originalService)) {
          continue
        }
        if (!originalService.name) {
          continue
        }

        // Find the room for this undiscovered service
        let targetRoom = mergedLayout.find(room => room.name === originalRoom.name)

        // If the room doesn't exist in current layout, it was deleted by the user
        // Move undiscovered services to the default room instead of recreating the deleted room
        if (!targetRoom) {
          targetRoom = mergedLayout.find(room => room.isDefault)
          if (!targetRoom) {
            continue
          }
        }

        // Add the undiscovered service with its preserved custom information
        targetRoom.services.push({
          uniqueId: originalService.uniqueId,
          nameBasedUniqueId: originalService.nameBasedUniqueId,
          name: originalService.name,
          bridge: originalService.bridge,
          serial: originalService.serial,
          aid: originalService.aid,
          iid: originalService.iid,
          uuid: originalService.uuid,
          customName: originalService.customName,
          customType: originalService.customType,
          hidden: originalService.hidden,
          onDashboard: originalService.onDashboard,
        })
      }
    }

    // Keep rooms that either have services OR were in the current layout (user-created empty rooms)
    return mergedLayout.filter(room =>
      room.services.length > 0 || currentLayout.some(r => r.name === room.name),
    )
  }

  /**
   * Parse the incoming accessory data and refresh existing accessory statuses
   */
  private parseServices(services: ServiceType[]) {
    if (!this.accessories.services.length) {
      this.accessories.services = services
      return
    }

    // Replace existing objects instead of mutating them for zoneless change detection
    services.forEach((service) => {
      const existingIndex = this.accessories.services.findIndex(x => x.uniqueId === service.uniqueId)

      if (existingIndex !== -1) {
        // Replace the object instead of mutating it
        this.accessories.services[existingIndex] = service
        // Clear from customAttributesApplied Set so attributes get re-applied to the new object
        this.customAttributesApplied.delete(service.uniqueId!)
      } else {
        this.accessories.services.push(service)
      }
    })
  }

  /**
   * Sort the accessories into their rooms
   */
  private sortIntoRooms() {
    this.accessories.services.forEach((service) => {
      // Don't put hidden types or combined services into rooms
      // Matter services use deviceType instead of type
      if (this.hiddenTypes.has(service.type) || this.hiddenTypes.has((service as ServiceTypeX).deviceType!) || this.combinedServiceIds.has(service.uniqueId!)) {
        return
      }

      // Link services
      if (service.linked) {
        service.linkedServices = {}
        service.linked.forEach((iid) => {
          service.linkedServices![iid] = this.accessories.services.find(s => s.aid === service.aid && s.iid === iid
            && s.instance.username === service.instance.username)!
        })
      }

      // Check if the service has already been allocated to an active room
      const inRoom = this.rooms().find(r => r.services.find(s => s.uniqueId === service.uniqueId))

      // Not in an active room, perhaps the service is in the layout cache
      if (!inRoom) {
        const cached = this.findInLayout(service)

        if (cached) {
          // Apply custom attributes from cache before adding to room
          const serviceX = service as ServiceTypeX
          if (cached.service.customType) {
            serviceX.customType = cached.service.customType
          }
          if (cached.service.customName) {
            serviceX.customName = cached.service.customName
          }
          if (cached.service.hidden) {
            serviceX.hidden = cached.service.hidden
          }
          if (cached.service.onDashboard) {
            serviceX.onDashboard = cached.service.onDashboard
          }

          // Mark that custom attributes have been applied to this accessory
          this.customAttributesApplied.add(service.uniqueId!)

          // Add to the correct room using signal update
          this.rooms.update(current => current.map(r =>
            r.name === cached.room.name
              ? {
                  ...r,
                  services: [...r.services, service],
                }
              : r,
          ))
        } else {
          // Mark as processed (even though no custom attributes to apply)
          this.customAttributesApplied.add(service.uniqueId!)

          // New accessory add to the default room
          const defaultRoom = this.rooms().find(r => r.isDefault === true)
            || this.rooms().find(r => r.name === 'Default Room')

          if (defaultRoom) {
            this.rooms.update(current => current.map(r =>
              r.name === defaultRoom.name
                ? {
                    ...r,
                    services: [...r.services, service],
                  }
                : r,
            ))
          } else {
            this.rooms.update(current => [
              ...current,
              {
                name: 'Default Room',
                isDefault: true,
                services: [service],
              },
            ])
          }
        }
      }
    })
  }

  /**
   * Order the services within each room based on the cached layout positions
   */
  private orderRooms() {
    this.rooms.update(current => current.map((room) => {
      const roomCache = this.accessoryLayout.find(r => r.name === room.name)
      if (!roomCache) {
        return room
      }

      const sortedServices = room.services.toSorted((a, b) => {
        const posA = roomCache.services.findIndex(s => this.servicesMatch(s, a))
        const posB = roomCache.services.findIndex(s => this.servicesMatch(s, b))
        return posA - posB
      })
      return { ...room, services: sortedServices }
    }))
  }

  /**
   * Refresh rooms to use updated service references for zoneless change detection
   * After parseServices() replaces service objects, we need to update the rooms
   * to point to the new service references from this.accessories.services
   */
  private refreshRoomsForChangeDetection() {
    this.rooms.update(current => current.map(room => ({
      ...room,
      services: room.services.map((service) => {
        // Find the updated service from the main accessories array
        const updatedService = this.accessories.services.find(s => s.uniqueId === service.uniqueId)
        return updatedService || service
      }),
    })))
  }

  /**
   * Apply custom attributes to services that haven't been processed yet
   * Only applies the custom properties we care about: customName, customType, hidden, onDashboard
   */
  private applyCustomAttributes() {
    this.rooms().forEach((room) => {
      room.services.forEach((service) => {
        // Skip if we've already applied custom attributes to this accessory
        if (this.customAttributesApplied.has(service.uniqueId!)) {
          return
        }

        // Use servicesMatch to find the cached service across any room in the layout
        const cached = this.findInLayout(service)
        if (!cached) {
          return
        }

        // Only apply the custom properties we care about, not all properties
        const serviceX = service as ServiceTypeX
        if (cached.service.customType) {
          serviceX.customType = cached.service.customType
        }
        if (cached.service.customName) {
          serviceX.customName = cached.service.customName
        }
        if (cached.service.hidden) {
          serviceX.hidden = cached.service.hidden
        }
        if (cached.service.onDashboard) {
          serviceX.onDashboard = cached.service.onDashboard
        }

        // Mark this accessory as processed
        this.customAttributesApplied.add(service.uniqueId!)
      })
    })
  }

  /**
   * Generate helpers for accessory control
   */
  private generateHelpers() {
    this.accessories.services.forEach((service) => {
      attachControlHelpers(service as ServiceTypeX, {
        send: payload => this.io.socket.emit('accessory-control', payload),
        hapReady: () => this.hapReadyForControl,
        matterReady: () => this.matterReadyForControl,
      })
    })
  }

  /**
   * Check if two services belong to the same physical accessory
   * (same name, serial number, and bridge instance)
   */
  private isSameAccessory(a: ServiceType, b: ServiceType): boolean {
    return a.accessoryInformation.Name === b.accessoryInformation.Name
      && a.accessoryInformation['Serial Number'] === b.accessoryInformation['Serial Number']
      && a.instance.username === b.instance.username
  }

  private attachLockManagementToMechanism(service: ServiceType) {
    const lockMechanisms: ServiceType[] = []
    const lockManagements: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (serv.type === 'LockMechanism' && this.isSameAccessory(serv, service)) {
        lockMechanisms.push(serv)
      } else if (serv.type === 'LockManagement' && this.isSameAccessory(serv, service)) {
        lockManagements.push(serv)
      }
    }

    if (lockMechanisms.length === 1 && lockManagements.length === 1) {
      const lockManagement = lockManagements[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[lockManagement.iid] = lockManagement
    }
  }

  private attachFanToHeaterCooler(service: ServiceType) {
    const heaterCoolers: ServiceType[] = []
    const fans: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (this.isSameAccessory(serv, service)) {
        if (serv.type === 'HeaterCooler') {
          heaterCoolers.push(serv)
        } else if (serv.type === 'Fan' || serv.type === 'Fanv2') {
          fans.push(serv)
        }
      }
    }

    if (heaterCoolers.length === 1 && fans.length === 1) {
      const fan = fans[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[fan.iid] = fan
      this.combinedServiceIds.add(fan.uniqueId!)
    }
  }

  private attachFanToHumidifierDehumidifier(service: ServiceType) {
    const humidifierDehumidifiers: ServiceType[] = []
    const fans: ServiceType[] = []

    for (const serv of this.accessories.services) {
      if (this.isSameAccessory(serv, service)) {
        if (serv.type === 'HumidifierDehumidifier') {
          humidifierDehumidifiers.push(serv)
        } else if (serv.type === 'Fan' || serv.type === 'Fanv2') {
          fans.push(serv)
        }
      }
    }

    if (humidifierDehumidifiers.length === 1 && fans.length === 1) {
      const fan = fans[0]

      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[fan.iid] = fan
      this.combinedServiceIds.add(fan.uniqueId!)
    }
  }

  /**
   * Show a camera as one tile, built on its first video stream. Folded into it: any other
   * streams, its microphone, speaker and motion sensor, and on a video doorbell the bell and its
   * button. A part is folded only when the camera has exactly one of that type, as with the fan
   * on a heater cooler. The battery, a light and a siren keep their own tiles (decided by BP).
   * A doorbell is told from a plain camera by its Doorbell service, which HomeKit requires.
   */
  private attachPartsToCamera(service: ServiceType) {
    const sameAccessory = this.accessories.services.filter(serv => this.isSameAccessory(serv, service))
    const ofType = (type: string) => sameAccessory.filter(serv => serv.type === type)

    const streams = ofType('CameraRTPStreamManagement').sort((a, b) => a.iid - b.iid)
    if (streams[0] !== service) {
      return
    }

    const parts = streams.slice(1)
    for (const type of [
      'Microphone',
      'Speaker',
      'MotionSensor',
      'Doorbell',
    ]) {
      const found = ofType(type)
      if (found.length === 1) {
        parts.push(found[0])
      }
    }
    const buttons = ofType('StatelessProgrammableSwitch')
    if (ofType('Doorbell').length === 1 && buttons.length === 1) {
      parts.push(buttons[0])
    }

    for (const part of parts) {
      if (!service.linkedServices) {
        service.linkedServices = {}
      }
      service.linkedServices[part.iid] = part
      this.combinedServiceIds.add(part.uniqueId!)
    }
  }

  private combineRelatedServices() {
    this.combinedServiceIds.clear()

    for (const service of this.accessories.services) {
      if (service.type === 'CameraRTPStreamManagement') {
        this.attachPartsToCamera(service)
      } else if (service.type === 'HeaterCooler') {
        this.attachFanToHeaterCooler(service)
      } else if (service.type === 'HumidifierDehumidifier') {
        this.attachFanToHumidifierDehumidifier(service)
      } else if (service.type === 'LockMechanism') {
        // Here rather than in parseServices, which is where this used to live.
        // parseServices returns early on the very first payload, so the link
        // was never made on load: the long-press modal offered no lock
        // management settings until the lock next changed state, which for a
        // door lock can be hours. And on later payloads it searched the array
        // before the replacement objects were written back, so the mechanism
        // ended up linked to the previous management object — a stale
        // reference that was replaced again on the following event.
        this.attachLockManagementToMechanism(service)
      }
    }

    // Remove combined fan services from rooms using immutable signal update
    this.rooms.update(current => current.map(room => ({
      ...room,
      services: room.services.filter(s => !this.combinedServiceIds.has(s.uniqueId!)),
    })))
  }
}
