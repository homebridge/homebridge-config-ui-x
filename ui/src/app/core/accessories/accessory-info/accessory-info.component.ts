import { KeyValuePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CharacteristicType } from '@homebridge/hap-client'
import { Enums } from '@homebridge/hap-client/dist/hap-types'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
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
})
export class AccessoryInfoComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $modal = inject(NgbModal)
  private allCustomTypeList: Array<Array<ServiceTypeX['type']>> = [
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
    [
      'OnOffLight',
      'OnOffLightSwitch',
      'OnOffPlugInUnit',
      'RoboticVacuumCleaner',
    ],
  ]

  @Input() private accessoryCache: any[]
  @Input() private pairingCache: any[]
  @Input() public service: ServiceTypeX

  public isDetailsVisible: { [key: string]: boolean } = {}
  public accessoryInformation: Array<{ key: string, value: string | number | undefined }>
  public extraServices: ServiceTypeX[] = []
  public matchedCachedAccessory: any = null
  public enums = Enums
  public customTypeList: Array<ServiceTypeX['type']> = []
  public isMatterAccessory = false
  public clusterInfo: Array<{ name: string, attributes: Record<string, unknown> }> = []

  public ngOnInit() {
    // Check if this is a Matter accessory
    this.isMatterAccessory = this.service.protocol === 'matter'

    if (this.isMatterAccessory) {
      // For Matter accessories, use deviceType to build custom type list
      this.customTypeList = [
        ...new Set(this.allCustomTypeList.filter(types => types.includes(this.service.deviceType)).flat()),
      ]

      // For Matter accessories, use displayName and handle cluster info
      const clusters = this.service.clusters || {}
      this.clusterInfo = Object.entries(clusters).map(([name, attributes]) => ({ name, attributes }))

      // Build basic accessory information from Matter accessory
      // Start with the standard accessoryInformation from backend
      this.accessoryInformation = Object.entries(this.service.accessoryInformation || {}).map(([key, value]) => ({
        key,
        value: value as string | number | undefined,
      }))

      // Prepend Device Type
      this.accessoryInformation.unshift(
        { key: 'Device Type', value: this.service.deviceType || 'Unknown' },
      )

      // Set default customType for Matter accessories
      if (!this.service.customType) {
        this.service.customType = this.service.deviceType
      }
    } else {
      // HAP accessory - use type to build custom type list
      this.customTypeList = [
        ...new Set(this.allCustomTypeList.filter(types => types.includes(this.service.type)).flat()),
      ]

      // HAP accessory
      this.accessoryInformation = Object.entries(this.service.accessoryInformation).map(([key, value]) => ({
        key,
        value: value as string | number | undefined,
      }))
      this.matchedCachedAccessory = this.matchToCachedAccessory()

      if (this.service.type === 'LockMechanism') {
        Object.values(this.service.linkedServices)
          .filter(service => service.type === 'LockManagement')
          .forEach(service => this.extraServices.push(service))
      }

      // Set default customType for HAP accessories
      if (!this.service.customType) {
        this.service.customType = this.service.type
      }
    }
  }

  public removeSingleCachedAccessories() {
    this.$activeModal.close()
    const ref = this.$modal.open(RemoveIndividualAccessoriesComponent, {
      size: 'lg',
      backdrop: 'static',
    })
    ref.componentInstance.selectedBridge = this.service.instance.username.replaceAll(':', '')
  }

  public isDefaultType(customType: string): boolean {
    if (this.isMatterAccessory) {
      return customType === this.service.deviceType
    } else {
      // For HAP accessories, check against service.type
      return customType === this.service.type
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

  private matchToCachedAccessory() {
    // Try to find a matching accessory from the cache
    // Start with the service bridge username and see if we have a pairing with this username
    const bridgeUsername = this.service.instance.username
    const pairing = this.pairingCache.find(pairing => pairing._username === bridgeUsername)

    if (pairing) {
      // Now to the accessory cache to grab a list of this bridge's cached accessories
      const cacheFile = pairing._main
        ? 'cachedAccessories'
        : `cachedAccessories.${pairing._id}`

      const pairingAccessories = this.accessoryCache.filter(accessory => accessory.$cacheFile === cacheFile)
      if (pairingAccessories.length) {
        const serviceInputName = this.service.accessoryInformation.Name
        const serviceInputSerialNumber = this.service.accessoryInformation['Serial Number']
        const matchingAccessories = pairingAccessories.filter((cachedAccessory) => {
          const accessoryInfoService = cachedAccessory.services.find(service => service.constructorName === 'AccessoryInformation')
          const charName = accessoryInfoService.characteristics.find((char: any) => char.displayName === 'Name')
          const charSerialNumber = accessoryInfoService.characteristics.find((char: any) => char.displayName === 'Serial Number')
          return charName.value === serviceInputName && charSerialNumber.value === serviceInputSerialNumber
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

  protected readonly Number = Number
  protected readonly JSON = JSON
}
