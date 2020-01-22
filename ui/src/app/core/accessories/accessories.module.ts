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
import { ThermostatComponent } from './types/thermostat/thermostat.component';
import { ThermostatManageComponent } from './types/thermostat/thermostat.manage.component';
import { OutletComponent } from './types/outlet/outlet.component';
import { FanComponent } from './types/fan/fan.component';
import { FanManageComponent } from './types/fan/fan.manage.component';
import { UnknownComponent } from './types/unknown/unknown.component';
import { LightbulbComponent } from './types/lightbulb/lightbulb.component';
import { LightbulbManageComponent } from './types/lightbulb/lightbulb.manage.component';
import { LockmechanismComponent } from './types/lockmechanism/lockmechanism.component';
import { TemperaturesensorComponent } from './types/temperaturesensor/temperaturesensor.component';
import { GaragedooropenerComponent } from './types/garagedooropener/garagedooropener.component';
import { MotionsensorComponent } from './types/motionsensor/motionsensor.component';
import { OccupancysensorComponent } from './types/occupancysensor/occupancysensor.component';
import { HumiditysensorComponent } from './types/humiditysensor/humiditysensor.component';
import { AirqualitysensorComponent } from './types/airqualitysensor/airqualitysensor.component';
import { WindowcoveringComponent } from './types/windowcovering/windowcovering.component';
import { WindowcoveringManageComponent } from './types/windowcovering/windowcovering.manage.component';
import { TelevisionComponent } from './types/television/television.component';
import { ContactsensorComponent } from './types/contactsensor/contactsensor.component';
import { BatteryserviceComponent } from './types/batteryservice/batteryservice.component';
import { SpeakerComponent } from './types/speaker/speaker.component';
import { SpeakerManageComponent } from './types/speaker/speaker.manage.component';

import { InfoModalComponent } from './info-modal/info-modal.component';

@NgModule({
  entryComponents: [
    InfoModalComponent,
    ThermostatManageComponent,
    LightbulbManageComponent,
    FanManageComponent,
    WindowcoveringManageComponent,
    SpeakerManageComponent,
  ],
  declarations: [
    InfoModalComponent,
    SwitchComponent,
    ThermostatComponent,
    ThermostatManageComponent,
    OutletComponent,
    FanComponent,
    FanManageComponent,
    UnknownComponent,
    LightbulbComponent,
    LightbulbManageComponent,
    LockmechanismComponent,
    TemperaturesensorComponent,
    GaragedooropenerComponent,
    MotionsensorComponent,
    OccupancysensorComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowcoveringComponent,
    WindowcoveringManageComponent,
    TelevisionComponent,
    ContactsensorComponent,
    BatteryserviceComponent,
    SpeakerComponent,
    SpeakerManageComponent,
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
    ThermostatComponent,
    ThermostatManageComponent,
    OutletComponent,
    FanComponent,
    FanManageComponent,
    UnknownComponent,
    LightbulbComponent,
    LightbulbManageComponent,
    LockmechanismComponent,
    TemperaturesensorComponent,
    GaragedooropenerComponent,
    MotionsensorComponent,
    OccupancysensorComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowcoveringComponent,
    WindowcoveringManageComponent,
    TelevisionComponent,
    ContactsensorComponent,
    BatteryserviceComponent,
    SpeakerComponent,
    SpeakerManageComponent,
  ],
  providers: [
    AccessoriesService,
  ],
})
export class AccessoriesCoreModule { }
