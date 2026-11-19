import { KeyValuePipe } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  OnDestroy,
  OnInit,
  signal,
  WritableSignal,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CharacteristicType } from '@homebridge/hap-client'
import { Enums } from '@homebridge/hap-client/hap-types'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import {
  CachedAccessoryWithServices,
  MatchedCachedAccessory,
  PairingInfo,
  ServiceTypeX,
} from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { hapStatusKey, hasErrorStatus, isNotResponding, notRespondingCodes } from '@/app/core/accessories/not-responding'
import { ACCESSORY_INFO_MODAL_DATA, REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { PrettifyPipe } from '@/app/core/pipes/prettify.pipe'
import { ServiceToTranslationStringPipe } from '@/app/core/pipes/service-to-translation-string'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'

@Component({
  selector: 'app-accessory-info',
  imports: [
    FormsModule,
    KeyValuePipe,
    TranslatePipe,
    ConvertTempPipe,
    PrettifyPipe,
    ConvertMiredPipe,
    ServiceToTranslationStringPipe,
  ],
  standalone: true,
  templateUrl: './accessory-info.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoryInfoComponent implements OnInit, OnDestroy {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $cdr = inject(ChangeDetectorRef)
  private $modal = inject(NgbModal)
  private $accessories = inject(AccessoriesService)

  // Private properties
  private modalData = inject(ACCESSORY_INFO_MODAL_DATA)
  private injector = inject(EnvironmentInjector)
  private copyTimeouts = new Map<WritableSignal<boolean>, ReturnType<typeof setTimeout>>()

  private hapCustomTypeList: Array<Array<ServiceTypeX['type']>> = [
    // Groups of service types that can be changed from one to another
    [
      'AirPurifier',
      'Switch',
      'Outlet',
      'Fan',
      'Lightbulb',
      'Heater',
      'Cooler',
      'Humidifier',
      'Dehumidifier',
      'Television',
      'Valve',
      'RobotVacuum',
      'WashingMachine',
    ],
    [
      'Switch',
      'Outlet',
      'LockMechanism',
    ],
    [
      'Switch',
      'Outlet',
      'GarageDoorOpener',
    ],
    [
      'Door',
      'Window',
      'WindowCovering',
    ],
    [
      'Switch',
      'Outlet',
      'Doorbell',
      'Speaker',
      'SmartSpeaker',
      'Microphone',
    ],
  ]

  private matterCustomTypeList: Array<Array<ServiceTypeX['type']>> = [
    // Groups of service types that can be changed from one to another
    [
      'OnOffLight',
      'OnOffLightSwitch',
      'OnOffPlugInUnit',
      'RoboticVacuumCleaner',
    ],
    [
      'Door',
      'Window',
      'WindowCovering',
    ],
    [
      'Fan',
    ],
    [
      'Thermostat',
    ],
  ]

  // Public properties (from injected data)
  public accessoryCache = this.modalData.accessoryCache
  public pairingCache = this.modalData.pairingCache
  public service = this.modalData.service
  protected readonly isNotResponding = isNotResponding
  protected readonly notRespondingCodes = notRespondingCodes
  protected readonly hasErrorStatus = hasErrorStatus
  protected readonly hapStatusKey = hapStatusKey

  // Other public properties
  public localAccessoryCache: CachedAccessoryWithServices[] = []
  public localPairingCache: PairingInfo[] = []
  public localService!: ServiceTypeX
  public isDetailsVisible: { [key: string]: boolean } = {}

  /** Whether a characteristic has any limits worth listing in its details. */
  public hasLimits(characteristic: object): boolean {
    return [
      'minStep',
      'minValue',
      'maxValue',
      'validValues',
    ].some(key => key in characteristic)
  }

  public accessoryInformation!: Array<{ key: string, value: string | number | undefined }>
  public extraServices: ServiceTypeX[] = []
  public matchedCachedAccessory: MatchedCachedAccessory = null
  public enums: Record<string, Record<string, string>> = Enums as any
  public customTypeList: Array<ServiceTypeX['type']> = []
  public isMatterAccessory = false
  public clusterInfo: Array<{ name: string, attributes: Record<string, unknown> }> = []
  public readonly uniqueIdCopied = signal(false)
  public readonly uuidCopied = signal(false)
  // Room row state: the inline "New room…" input
  public addingRoom = false
  public newRoomName = ''
  public newRoomError = ''
  /** The room chosen in this modal. Only the service applies it, when Save is pressed. */
  public pendingRoom: string | undefined
  private originalRoom: string | undefined

  public getEnumLabel(type: string, value: string | number | boolean | null | undefined): string | undefined {
    return this.enums[type]?.[String(value)]
  }

  // Original values to restore on dismiss
  private saved = false
  private originalCustomName: string | undefined
  private originalCustomType: ServiceTypeX['type'] | undefined
  private originalHidden: boolean | undefined
  private originalOnDashboard: boolean | undefined

  public ngOnInit() {
    // Extract values from signals to local properties
    const accessoryCache = this.accessoryCache
    const pairingCache = this.pairingCache
    const service = this.service

    // Null safety check
    if (!accessoryCache || !pairingCache || !service) {
      console.error('AccessoryInfoComponent: required data not provided')
      this.$activeModal.dismiss('Missing required data')
      return
    }

    // Store in local properties (same object references)
    this.localAccessoryCache = accessoryCache
    this.localPairingCache = pairingCache
    this.localService = service

    // Check if this is a Matter accessory
    this.isMatterAccessory = this.localService.protocol === 'matter'

    if (this.isMatterAccessory) {
      // For Matter accessories, use deviceType to build custom type list from matterCustomTypeList
      this.customTypeList = [
        ...new Set(this.matterCustomTypeList.filter(types => this.localService.deviceType && types.includes(this.localService.deviceType)).flat()),
      ]

      // For Matter accessories, use displayName and handle cluster info
      const clusters = this.localService.clusters || {}
      this.clusterInfo = Object.entries(clusters).map(([name, attributes]) => ({ name, attributes: attributes as Record<string, unknown> }))

      // Build basic accessory information from Matter accessory
      // Start with the standard accessoryInformation from backend
      this.accessoryInformation = Object.entries(this.localService.accessoryInformation || {}).map(([key, value]) => ({
        key,
        value: value as string | number | undefined,
      }))

      // Prepend Device Type
      this.accessoryInformation.unshift(
        { key: 'Device Type', value: this.localService.deviceType || 'Unknown' },
      )

      // Set default customType for Matter accessories
      if (!this.localService.customType) {
        this.localService.customType = this.localService.deviceType
      }
    } else {
      // HAP accessory - use type to build custom type list from hapCustomTypeList
      this.customTypeList = [
        ...new Set(this.hapCustomTypeList.filter(types => types.includes(this.localService.type)).flat()),
      ]

      // Speaker and SmartSpeaker render with the same tile, so only offer the variant
      // that matches the real accessory type - never list both in the dropdown
      if (this.localService.type === 'SmartSpeaker') {
        this.customTypeList = this.customTypeList.filter(type => type !== 'Speaker')
      } else {
        this.customTypeList = this.customTypeList.filter(type => type !== 'SmartSpeaker')

        // Migrate a stale SmartSpeaker customType (set before this dedup) to Speaker
        if (this.localService.customType === 'SmartSpeaker') {
          this.localService.customType = 'Speaker'
        }
      }

      // HAP accessory
      this.accessoryInformation = Object.entries(this.localService.accessoryInformation).map(([key, value]) => ({
        key,
        value: value as string | number | undefined,
      }))
      this.matchedCachedAccessory = this.matchToCachedAccessory()

      if (this.localService.type === 'LockMechanism' && this.localService.linkedServices) {
        Object.values(this.localService.linkedServices)
          .filter(service => service.type === 'LockManagement')
          .forEach(service => this.extraServices.push(service))
      }

      // Set default customType for HAP accessories
      if (!this.localService.customType) {
        this.localService.customType = this.localService.type
      }
    }

    // Save original values so we can restore on dismiss
    this.originalCustomName = this.localService.customName
    this.originalCustomType = this.localService.customType
    this.originalHidden = this.localService.hidden
    this.originalOnDashboard = this.localService.onDashboard
    this.originalRoom = this.currentRoomName
    this.pendingRoom = this.originalRoom
  }

  // Public methods
  public ngOnDestroy() {
    // Clear all pending timeouts to prevent memory leaks
    this.copyTimeouts.forEach(timeout => clearTimeout(timeout))
    this.copyTimeouts.clear()

    // The fields are edited on the tile's own service object. Closing in any way other than Save (Escape, or
    // the cached accessories button) must undo them too, or the next layout save stores the "cancelled" edit
    if (!this.saved) {
      this.restoreOriginalValues()
    }
  }

  private restoreOriginalValues(): void {
    if (!this.localService) {
      return
    }
    this.localService.customName = this.originalCustomName
    this.localService.customType = this.originalCustomType
    this.localService.hidden = this.originalHidden
    this.localService.onDashboard = this.originalOnDashboard
  }

  public removeSingleCachedAccessories() {
    this.$activeModal.close()
    const injector = createEnvironmentInjector([
      {
        provide: REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA,
        useValue: {
          selectedBridge: this.localService.instance.username.replaceAll(':', ''),
          highlightUuid: this.matchedCachedAccessory?.UUID,
          highlightCacheFile: this.matchedCachedAccessory?.$cacheFile,
        },
      },
    ], this.injector)

    this.$modal.open(RemoveIndividualAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
      injector,
    })
  }

  public isDefaultType(customType: string): boolean {
    if (this.isMatterAccessory) {
      return customType === this.localService.deviceType
    } else {
      // For HAP accessories, check against service.type
      return customType === this.localService.type
    }
  }

  public toggleDetailsVisibility(char: CharacteristicType): void {
    if ('minStep' in char || 'minValue' in char || 'maxValue' in char || 'validValues' in char) {
      this.isDetailsVisible[char.uuid] = !this.isDetailsVisible[char.uuid]
    }
  }

  public dismissModal() {
    this.restoreOriginalValues()
    this.$activeModal.dismiss('Dismiss')
  }

  public saveModal() {
    this.saved = true
    this.$activeModal.close({
      customName: this.localService.customName,
      customType: this.localService.customType,
      hidden: this.localService.hidden,
      onDashboard: this.localService.onDashboard,
      // Only sent when the user picked another room; the service moves the accessory on Save
      ...(this.pendingRoom !== this.originalRoom
        ? { room: this.pendingRoom }
        : {}),
    })
  }

  public isFormUnchanged(): boolean {
    return this.localService.customName === this.originalCustomName
      && this.localService.customType === this.originalCustomType
      && this.localService.hidden === this.originalHidden
      && this.localService.onDashboard === this.originalOnDashboard
      && this.pendingRoom === this.originalRoom
  }

  public onHiddenChange(): void {
    if (this.localService.hidden) {
      this.localService.onDashboard = false
    }
    this.$cdr.markForCheck()
  }

  public onDashboardChange(): void {
    // Mark for check to update the view when onDashboard state changes
    // This is necessary with OnPush change detection
    this.$cdr.markForCheck()
  }

  /** The room the accessory is in, or undefined when the layout does not hold it */
  public get currentRoomName(): string | undefined {
    return this.$accessories.getRoomNameForService(this.localService?.uniqueId ?? '')
  }

  /** The room row is only shown when there is a layout and this accessory is in it */
  public get showRoomRow(): boolean {
    return this.$accessories.rooms().length > 0 && this.currentRoomName !== undefined
  }

  /** The room names to offer: every room, plus a room staged here that does not exist yet */
  public get roomNames(): string[] {
    const names = this.$accessories.rooms().map(room => room.name)
    if (this.pendingRoom && !names.includes(this.pendingRoom)) {
      names.push(this.pendingRoom)
    }
    return names
  }

  /** Room select change. The empty value is the "New room…" option, as no room can be blank. Only stages the room. */
  public onRoomSelect(value: string): void {
    if (value === '') {
      this.addingRoom = true
      this.newRoomName = ''
      this.newRoomError = ''
    } else {
      this.pendingRoom = value
      this.cancelNewRoom()
    }
    this.$cdr.markForCheck()
  }

  /** Stage a new room name. It is created only when Save is pressed. */
  public addNewRoom(): void {
    const name = this.newRoomName.trim()
    const lowered = name.toLowerCase()
    const taken = this.roomNames.some(existing => existing.trim().toLowerCase() === lowered)
    if (!name || taken) {
      this.newRoomError = 'accessories.room_name_invalid'
      this.$cdr.markForCheck()
      return
    }
    this.pendingRoom = name
    this.cancelNewRoom()
  }

  public cancelNewRoom(): void {
    this.addingRoom = false
    this.newRoomName = ''
    this.newRoomError = ''
    this.$cdr.markForCheck()
  }

  public async copyUniqueIdToClipboard(): Promise<void> {
    const uniqueId = this.service.uniqueId
    if (uniqueId) {
      await this.copyToClipboard(uniqueId, this.uniqueIdCopied)
    }
  }

  public async copyUUIDToClipboard(): Promise<void> {
    const uuid = this.matchedCachedAccessory?.UUID
    if (uuid) {
      await this.copyToClipboard(uuid, this.uuidCopied)
    }
  }

  // Private methods
  private async copyToClipboard(text: string, copiedSignal: WritableSignal<boolean>): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      // Fallback for iOS Safari
      this.fallbackCopyToClipboard(text)
    }

    copiedSignal.set(true)

    // Clear existing timeout for this signal if any
    const existingTimeout = this.copyTimeouts.get(copiedSignal)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout to reset the copied state
    const timeout = setTimeout(() => {
      copiedSignal.set(false)
      this.copyTimeouts.delete(copiedSignal)
    }, 3000)

    this.copyTimeouts.set(copiedSignal, timeout)
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-999999px'
    textArea.style.top = '-999999px'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    try {
      document.execCommand('copy')
    } catch (error) {
      console.error('Fallback: Could not copy text', error)
    }
    document.body.removeChild(textArea)
  }

  private matchToCachedAccessory() {
    // Try to find a matching accessory from the cache
    // Start with the service bridge username and see if we have a pairing with this username
    const bridgeUsername = this.localService.instance.username
    const pairing = this.localPairingCache.find(pairing => pairing._username === bridgeUsername)

    if (pairing) {
      // Now to the accessory cache to grab a list of this bridge's cached accessories
      const cacheFile = pairing._main
        ? 'cachedAccessories'
        : `cachedAccessories.${pairing._id}`

      const pairingAccessories = this.localAccessoryCache.filter(accessory => accessory.$cacheFile === cacheFile)
      if (pairingAccessories.length) {
        const serviceInputName = this.localService.accessoryInformation.Name
        const serviceInputSerialNumber = this.localService.accessoryInformation['Serial Number']
        const matchingAccessories = pairingAccessories.filter((cachedAccessory) => {
          const accessoryInfoService = cachedAccessory.services.find(service => service.constructorName === 'AccessoryInformation')
          const charName = accessoryInfoService?.characteristics.find(char => char.displayName === 'Name')
          const charSerialNumber = accessoryInfoService?.characteristics.find(char => char.displayName === 'Serial Number')
          return charName?.value === serviceInputName && charSerialNumber?.value === serviceInputSerialNumber
        })
        if (matchingAccessories.length === 1) {
          return {
            ...matchingAccessories[0],
            bridge: pairing.name,
          }
        }
      }
    }

    return null
  }

  // Protected readonly properties
  protected readonly Number = Number
  protected readonly JSON = JSON
}
