import { Component, inject, Input } from '@angular/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { AirpurifierComponent } from '@/app/core/accessories/types/airpurifier/airpurifier.component'
import { AirqualitysensorComponent } from '@/app/core/accessories/types/airqualitysensor/airqualitysensor.component'
import { BatteryComponent } from '@/app/core/accessories/types/battery/battery.component'
import { CarbondioxidesensorComponent } from '@/app/core/accessories/types/carbondioxidesensor/carbondioxidesensor.component'
import { CarbonmonoxidesensorComponent } from '@/app/core/accessories/types/carbonmonoxidesensor/carbonmonoxidesensor.component'
import { ContactsensorComponent } from '@/app/core/accessories/types/contactsensor/contactsensor.component'
import { DoorComponent } from '@/app/core/accessories/types/door/door.component'
import { FanComponent } from '@/app/core/accessories/types/fan/fan.component'
import { Fanv2Component } from '@/app/core/accessories/types/fanv2/fanv2.component'
import { GaragedooropenerComponent } from '@/app/core/accessories/types/garagedooropener/garagedooropener.component'
import { HeaterCoolerComponent } from '@/app/core/accessories/types/heatercooler/heatercooler.component'
import { HumidifierDehumidifierComponent } from '@/app/core/accessories/types/humidifierdehumidifier/humidifierdehumidifier.component'
import { HumiditysensorComponent } from '@/app/core/accessories/types/humiditysensor/humiditysensor.component'
import { IrrigationSystemComponent } from '@/app/core/accessories/types/irrigationsystem/irrigationsystem.component'
import { LeaksensorComponent } from '@/app/core/accessories/types/leaksensor/leaksensor.component'
import { LightbulbComponent } from '@/app/core/accessories/types/lightbulb/lightbulb.component'
import { LightsensorComponent } from '@/app/core/accessories/types/lightsensor/lightsensor.component'
import { LockmanagementComponent } from '@/app/core/accessories/types/lockmechanism/lockmanagement.component'
import { LockmechanismComponent } from '@/app/core/accessories/types/lockmechanism/lockmechanism.component'
import { MotionsensorComponent } from '@/app/core/accessories/types/motionsensor/motionsensor.component'
import { OccupancysensorComponent } from '@/app/core/accessories/types/occupancysensor/occupancysensor.component'
import { OutletComponent } from '@/app/core/accessories/types/outlet/outlet.component'
import { SecuritysystemComponent } from '@/app/core/accessories/types/securitysystem/securitysystem.component'
import { SmokesensorComponent } from '@/app/core/accessories/types/smokesensor/smokesensor.component'
import { SpeakerComponent } from '@/app/core/accessories/types/speaker/speaker.component'
import { StatelessprogrammableswitchComponent } from '@/app/core/accessories/types/statelessprogrammableswitch/statelessprogrammableswitch.component'
import { SwitchComponent } from '@/app/core/accessories/types/switch/switch.component'
import { TelevisionComponent } from '@/app/core/accessories/types/television/television.component'
import { TemperaturesensorComponent } from '@/app/core/accessories/types/temperaturesensor/temperaturesensor.component'
import { ThermostatComponent } from '@/app/core/accessories/types/thermostat/thermostat.component'
import { UnknownComponent } from '@/app/core/accessories/types/unknown/unknown.component'
import { ValveComponent } from '@/app/core/accessories/types/valve/valve.component'
import { WindowComponent } from '@/app/core/accessories/types/window/window.component'
import { WindowCoveringComponent } from '@/app/core/accessories/types/windowcovering/windowcovering.component'

@Component({
  selector: 'app-accessory-tile',
  templateUrl: './accessory-tile.component.html',
  standalone: true,
  imports: [
    SwitchComponent,
    ThermostatComponent,
    OutletComponent,
    FanComponent,
    Fanv2Component,
    AirpurifierComponent,
    LightbulbComponent,
    LightsensorComponent,
    LockmechanismComponent,
    LockmanagementComponent,
    TemperaturesensorComponent,
    GaragedooropenerComponent,
    MotionsensorComponent,
    OccupancysensorComponent,
    ContactsensorComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowCoveringComponent,
    WindowComponent,
    DoorComponent,
    TelevisionComponent,
    BatteryComponent,
    SpeakerComponent,
    SecuritysystemComponent,
    LeaksensorComponent,
    SmokesensorComponent,
    CarbonmonoxidesensorComponent,
    CarbondioxidesensorComponent,
    ValveComponent,
    IrrigationSystemComponent,
    HeaterCoolerComponent,
    HumidifierDehumidifierComponent,
    StatelessprogrammableswitchComponent,
    UnknownComponent,
  ],
})
export class AccessoryTileComponent {
  $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX

  constructor() {}
}
