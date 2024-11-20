import { NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common'

import { Component, inject, Input } from '@angular/core'
import { ServiceTypeX } from '../accessories.interfaces'
import { AccessoriesService } from '../accessories.service'
import { AirpurifierComponent } from '../types/airpurifier/airpurifier.component'
import { AirqualitysensorComponent } from '../types/airqualitysensor/airqualitysensor.component'
import { BatteryComponent } from '../types/battery/battery.component'
import { CarbondioxidesensorComponent } from '../types/carbondioxidesensor/carbondioxidesensor.component'
import { CarbonmonoxidesensorComponent } from '../types/carbonmonoxidesensor/carbonmonoxidesensor.component'
import { ContactsensorComponent } from '../types/contactsensor/contactsensor.component'
import { DoorComponent } from '../types/door/door.component'
import { FanComponent } from '../types/fan/fan.component'
import { Fanv2Component } from '../types/fanv2/fanv2.component'
import { GaragedooropenerComponent } from '../types/garagedooropener/garagedooropener.component'
import { HeaterCoolerComponent } from '../types/heatercooler/heatercooler.component'
import { HumidifierDehumidifierComponent } from '../types/humidifierdehumidifier/humidifierdehumidifier.component'
import { HumiditysensorComponent } from '../types/humiditysensor/humiditysensor.component'
import { IrrigationSystemComponent } from '../types/irrigationsystem/irrigationsystem.component'
import { LeaksensorComponent } from '../types/leaksensor/leaksensor.component'
import { LightbulbComponent } from '../types/lightbulb/lightbulb.component'
import { LightsensorComponent } from '../types/lightsensor/lightsensor.component'
import { LockmechanismComponent } from '../types/lockmechanism/lockmechanism.component'
import { MotionsensorComponent } from '../types/motionsensor/motionsensor.component'
import { OccupancysensorComponent } from '../types/occupancysensor/occupancysensor.component'
import { OutletComponent } from '../types/outlet/outlet.component'
import { SecuritysystemComponent } from '../types/securitysystem/securitysystem.component'
import { SmokesensorComponent } from '../types/smokesensor/smokesensor.component'
import { SpeakerComponent } from '../types/speaker/speaker.component'
import { StatelessprogrammableswitchComponent } from '../types/statelessprogrammableswitch/statelessprogrammableswitch.component'
import { SwitchComponent } from '../types/switch/switch.component'
import { TelevisionComponent } from '../types/television/television.component'
import { TemperaturesensorComponent } from '../types/temperaturesensor/temperaturesensor.component'
import { ThermostatComponent } from '../types/thermostat/thermostat.component'
import { UnknownComponent } from '../types/unknown/unknown.component'
import { ValveComponent } from '../types/valve/valve.component'
import { WindowComponent } from '../types/window/window.component'
import { WindowCoveringComponent } from '../types/windowcovering/windowcovering.component'

@Component({
  selector: 'app-accessory-tile',
  templateUrl: './accessory-tile.component.html',
  imports: [
    NgSwitch,
    NgIf,
    NgSwitchCase,
    SwitchComponent,
    ThermostatComponent,
    OutletComponent,
    FanComponent,
    Fanv2Component,
    AirpurifierComponent,
    LightbulbComponent,
    LightsensorComponent,
    LockmechanismComponent,
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
    NgSwitchDefault,
    UnknownComponent,
  ],
})
export class AccessoryTileComponent {
  $accessories = inject(AccessoriesService)

  @Input() public service: ServiceTypeX
}
