import { KeyValuePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, createEnvironmentInjector, EnvironmentInjector, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CharacteristicType } from '@homebridge/hap-client'
import { Enums } from '@homebridge/hap-client/dist/hap-types'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import {
  CachedAccessoryWithServices,
  MatchedCachedAccessory,
  PairingInfo,
  ServiceTypeX,
} from '@/app/core/accessories/accessories.interfaces'
import { ACCESSORY_INFO_MODAL_DATA, REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { PrettifyPipe } from '@/app/core/pipes/prettify.pipe'
import { ServiceToTranslationStringPipe } from '@/app/core/pipes/service-to-translation-string'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'

@Component({
  templateUrl: './accessory-info.component.html',
  standalone: true,
  imports: [
    FormsModule,
    KeyValuePipe,
    TranslatePipe,
    ConvertTempPipe,
    PrettifyPipe,
    ConvertMiredPipe,
    ServiceToTranslationStringPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessoryInfoComponent implements OnInit {
  // Injected dependencies
  private $activeModal = inject(NgbActiveModal)
  private $modal = inject(NgbModal)
  private modalData = inject(ACCESSORY_INFO_MODAL_DATA)
  private injector = inject(EnvironmentInjector)

  // Public properties (from injected data)
  public accessoryCache = this.modalData.accessoryCache
  public pairingCache = this.modalData.pairingCache
  public service = this.modalData.service

  // Other public properties
  public localAccessoryCache: CachedAccessoryWithServices[] = []
  public localPairingCache: PairingInfo[] = []
  public localService!: ServiceTypeX
  public isDetailsVisible: { [key: string]: boolean } = {}
  public accessoryInformation: Array<{ key: string, value: string | number | undefined }>
  public extraServices: ServiceTypeX[] = []
  public matchedCachedAccessory: MatchedCachedAccessory = null
  public enums = Enums
  public customTypeList: Array<ServiceTypeX['type']> = []
  public isMatterAccessory = false
  public clusterInfo: Array<{ name: string, attributes: unknown }> = []

  // Private properties
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

  // Lifecycle hooks
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
        ...new Set(this.matterCustomTypeList.filter(types => types.includes(this.localService.deviceType)).flat()),
      ]

      // For Matter accessories, use displayName and handle cluster info
      const clusters = this.localService.clusters || {}
      this.clusterInfo = Object.entries(clusters).map(([name, attributes]) => ({ name, attributes }))

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

      // HAP accessory
      this.accessoryInformation = Object.entries(this.localService.accessoryInformation).map(([key, value]) => ({
        key,
        value: value as string | number | undefined,
      }))
      this.matchedCachedAccessory = this.matchToCachedAccessory()

      if (this.localService.type === 'LockMechanism') {
        Object.values(this.localService.linkedServices)
          .filter(service => service.type === 'LockManagement')
          .forEach(service => this.extraServices.push(service))
      }

      // Set default customType for HAP accessories
      if (!this.localService.customType) {
        this.localService.customType = this.localService.type
      }
    }
  }

  // Public methods
  public removeSingleCachedAccessories() {
    this.$activeModal.close()
    const injector = createEnvironmentInjector([{
      provide: REMOVE_INDIVIDUAL_ACCESSORIES_MODAL_DATA,
      useValue: {
        selectedBridge: this.localService.instance.username.replaceAll(':', ''),
      },
    }], this.injector)

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
    this.$activeModal.dismiss('Dismiss')
  }

  // Private methods
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
  }

  // Protected readonly properties
  protected readonly Number = Number
  protected readonly JSON = JSON
}
