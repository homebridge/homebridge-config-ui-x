import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { NgxMdModule } from 'ngx-md';
import { InlineSVGModule } from 'ng-inline-svg';
import { NouisliderModule } from 'ng2-nouislider';

import { CoreModule } from '../core.module';
import { AccessoriesService } from './accessories.service';

import { SwitchComponent } from './types/switch/switch.component';
import { StatelessprogrammableswitchComponent } from './types/statelessprogrammableswitch/statelessprogrammableswitch.component';
import { ThermostatComponent } from './types/thermostat/thermostat.component';
import { ThermostatManageComponent } from './types/thermostat/thermostat.manage.component';
import { OutletComponent } from './types/outlet/outlet.component';
import { FanComponent } from './types/fan/fan.component';
import { FanManageComponent } from './types/fan/fan.manage.component';
import { Fanv2Component } from './types/fanv2/fanv2.component';
import { Fanv2ManageComponent } from './types/fanv2/fanv2.manage.component';
import { UnknownComponent } from './types/unknown/unknown.component';
import { LightbulbComponent } from './types/lightbulb/lightbulb.component';
import { LightbulbManageComponent } from './types/lightbulb/lightbulb.manage.component';
import { LightsensorComponent } from './types/lightsensor/lightsensor.component';
import { LockmechanismComponent } from './types/lockmechanism/lockmechanism.component';
import { TemperaturesensorComponent } from './types/temperaturesensor/temperaturesensor.component';
import { GaragedooropenerComponent } from './types/garagedooropener/garagedooropener.component';
import { MotionsensorComponent } from './types/motionsensor/motionsensor.component';
import { OccupancysensorComponent } from './types/occupancysensor/occupancysensor.component';
import { HumiditysensorComponent } from './types/humiditysensor/humiditysensor.component';
import { AirqualitysensorComponent } from './types/airqualitysensor/airqualitysensor.component';
import { WindowcoveringComponent } from './types/windowcovering/windowcovering.component';
import { WindowcoveringManageComponent } from './types/windowcovering/windowcovering.manage.component';
import { WindowComponent } from './types/window/window.component';
import { WindowManageComponent } from './types/window/window.manage.component';
import { DoorComponent } from './types/door/door.component';
import { DoorManageComponent } from './types/door/door.manage.component';
import { TelevisionComponent } from './types/television/television.component';
import { ContactsensorComponent } from './types/contactsensor/contactsensor.component';
import { BatteryserviceComponent } from './types/batteryservice/batteryservice.component';
import { SpeakerComponent } from './types/speaker/speaker.component';
import { SpeakerManageComponent } from './types/speaker/speaker.manage.component';
import { SecuritysystemComponent } from './types/securitysystem/securitysystem.component';
import { SecuritysystemManageComponent } from './types/securitysystem/securitysystem.manage.component';
import { LeaksensorComponent } from './types/leaksensor/leaksensor.component';
import { ValveComponent } from './types/valve/valve.component';
import { ValveManageComponent } from './types/valve/valve.manage.component';
import { IrrigationSystemComponent } from './types/irrigationsystem/irrigationsystem.component';
import { AirpurifierComponent } from './types/airpurifier/airpurifier.component';
import { AirpurifierManageComponent } from './types/airpurifier/airpurifier.manage.component';
import { HeaterCoolerComponent } from './types/heatercooler/heatercooler.component';
import { HeaterCoolerManageComponent } from './types/heatercooler/heatercooler.manage.component';

import { InfoModalComponent } from './info-modal/info-modal.component';

@NgModule({
  entryComponents: [
    InfoModalComponent,
    ThermostatManageComponent,
    LightbulbManageComponent,
    FanManageComponent,
    Fanv2ManageComponent,
    WindowcoveringManageComponent,
    WindowManageComponent,
    DoorManageComponent,
    SpeakerManageComponent,
    SecuritysystemManageComponent,
    ValveManageComponent,
    AirpurifierManageComponent,
    HeaterCoolerManageComponent,
  ],
  declarations: [
    InfoModalComponent,
    SwitchComponent,
    StatelessprogrammableswitchComponent,
    ThermostatComponent,
    ThermostatManageComponent,
    OutletComponent,
    FanComponent,
    FanManageComponent,
    Fanv2Component,
    Fanv2ManageComponent,
    UnknownComponent,
    LightbulbComponent,
    LightbulbManageComponent,
    LightsensorComponent,
    LockmechanismComponent,
    TemperaturesensorComponent,
    GaragedooropenerComponent,
    MotionsensorComponent,
    OccupancysensorComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowcoveringComponent,
    WindowcoveringManageComponent,
    WindowComponent,
    WindowManageComponent,
    DoorComponent,
    DoorManageComponent,
    TelevisionComponent,
    ContactsensorComponent,
    BatteryserviceComponent,
    SpeakerComponent,
    SpeakerManageComponent,
    SecuritysystemComponent,
    SecuritysystemManageComponent,
    LeaksensorComponent,
    ValveComponent,
    ValveManageComponent,
    IrrigationSystemComponent,
    AirpurifierComponent,
    AirpurifierManageComponent,
    HeaterCoolerComponent,
    HeaterCoolerManageComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    InlineSVGModule.forRoot(),
    TranslateModule.forChild(),
    NouisliderModule,
    NgbModule,
    NgxMdModule,
    CoreModule,
  ],
  exports: [
    SwitchComponent,
    StatelessprogrammableswitchComponent,
    ThermostatComponent,
    ThermostatManageComponent,
    OutletComponent,
    FanComponent,
    FanManageComponent,
    Fanv2Component,
    Fanv2ManageComponent,
    UnknownComponent,
    LightbulbComponent,
    LightbulbManageComponent,
    LightsensorComponent,
    LockmechanismComponent,
    TemperaturesensorComponent,
    GaragedooropenerComponent,
    MotionsensorComponent,
    OccupancysensorComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowcoveringComponent,
    WindowcoveringManageComponent,
    WindowComponent,
    WindowManageComponent,
    DoorComponent,
    DoorManageComponent,
    TelevisionComponent,
    ContactsensorComponent,
    BatteryserviceComponent,
    SpeakerComponent,
    SpeakerManageComponent,
    SecuritysystemComponent,
    SecuritysystemManageComponent,
    LeaksensorComponent,
    ValveComponent,
    ValveManageComponent,
    IrrigationSystemComponent,
    AirpurifierComponent,
    AirpurifierManageComponent,
    HeaterCoolerComponent,
    HeaterCoolerManageComponent,
  ],
  providers: [
    AccessoriesService,
  ],
})
export class AccessoriesCoreModule { }
