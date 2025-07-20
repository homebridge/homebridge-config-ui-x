import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Enums } from '@homebridge/hap-client/dist/hap-types'
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { ConvertMiredPipe } from '@/app/core/pipes/convert-mired.pipe'
import { ConvertTempPipe } from '@/app/core/pipes/convert-temp.pipe'
import { PrettifyPipe } from '@/app/core/pipes/prettify.pipe'
import { SpaceBeforeCapsPipe } from '@/app/core/pipes/space-before-caps'
import { RemoveIndividualAccessoriesComponent } from '@/app/modules/settings/remove-individual-accessories/remove-individual-accessories.component'

@Component({
  templateUrl: './accessory-info.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    ConvertTempPipe,
    PrettifyPipe,
    ConvertMiredPipe,
    SpaceBeforeCapsPipe,
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
    ],
    [
      'Switch',
      'Outlet',
      'LockMechanism',
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

  @Input() private accessoryCache: any[]
  @Input() private pairingCache: any[]
  @Input() public service: ServiceTypeX

  public accessoryInformation: Array<any>
  public extraServices: ServiceTypeX[] = []
  public matchedCachedAccessory: any = null
  public enums = Enums
  public customTypeList: Array<ServiceTypeX['type']> = []

  public ngOnInit() {
    this.accessoryInformation = Object.entries(this.service.accessoryInformation).map(([key, value]) => ({ key, value }))
    this.matchedCachedAccessory = this.matchToCachedAccessory()

    if (this.service.type === 'LockMechanism') {
      Object.values(this.service.linkedServices)
        .filter(service => service.type === 'LockManagement')
        .forEach(service => this.extraServices.push(service))
    }

    this.customTypeList = [
      ...new Set(this.allCustomTypeList.filter(types => types.includes(this.service.type)).flat()),
    ]
    if (!this.service.customType) {
      this.service.customType = this.service.type
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
}
