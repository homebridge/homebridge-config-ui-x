import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { InlineSVGModule } from 'ng-inline-svg-2';
import { NouisliderModule } from 'ng2-nouislider';
import { NgxMdModule } from 'ngx-md';
import { AccessoriesService } from './accessories.service';
import { AccessoryTileComponent } from './accessory-tile/accessory-tile.component';
import { InfoModalComponent } from './info-modal/info-modal.component';
import { AirpurifierComponent } from './types/airpurifier/airpurifier.component';
import { AirpurifierManageComponent } from './types/airpurifier/airpurifier.manage.component';
import { AirqualitysensorComponent } from './types/airqualitysensor/airqualitysensor.component';
import { BatteryserviceComponent } from './types/batteryservice/batteryservice.component';
import { ContactsensorComponent } from './types/contactsensor/contactsensor.component';
import { DoorComponent } from './types/door/door.component';
import { DoorManageComponent } from './types/door/door.manage.component';
import { FanComponent } from './types/fan/fan.component';
import { FanManageComponent } from './types/fan/fan.manage.component';
import { Fanv2Component } from './types/fanv2/fanv2.component';
import { Fanv2ManageComponent } from './types/fanv2/fanv2.manage.component';
import { GaragedooropenerComponent } from './types/garagedooropener/garagedooropener.component';
import { HeaterCoolerComponent } from './types/heatercooler/heatercooler.component';
import { HeaterCoolerManageComponent } from './types/heatercooler/heatercooler.manage.component';
import { HumidifierDehumidifierComponent } from './types/humidifierdehumidifier/humidifierdehumidifier.component';
import { HumidifierDehumidifierManageComponent } from './types/humidifierdehumidifier/humidifierdehumidifier.manage.component';
import { HumiditysensorComponent } from './types/humiditysensor/humiditysensor.component';
import { IrrigationSystemComponent } from './types/irrigationsystem/irrigationsystem.component';
import { LeaksensorComponent } from './types/leaksensor/leaksensor.component';
import { LightbulbComponent } from './types/lightbulb/lightbulb.component';
import { LightbulbManageComponent } from './types/lightbulb/lightbulb.manage.component';
import { LightsensorComponent } from './types/lightsensor/lightsensor.component';
import { LockmechanismComponent } from './types/lockmechanism/lockmechanism.component';
import { MotionsensorComponent } from './types/motionsensor/motionsensor.component';
import { OccupancysensorComponent } from './types/occupancysensor/occupancysensor.component';
import { OutletComponent } from './types/outlet/outlet.component';
import { SecuritysystemComponent } from './types/securitysystem/securitysystem.component';
import { SecuritysystemManageComponent } from './types/securitysystem/securitysystem.manage.component';
import { SmokesensorComponent } from './types/smokesensor/smokesensor.component';
import { SpeakerComponent } from './types/speaker/speaker.component';
import { SpeakerManageComponent } from './types/speaker/speaker.manage.component';
import { StatelessprogrammableswitchComponent } from './types/statelessprogrammableswitch/statelessprogrammableswitch.component';
import { SwitchComponent } from './types/switch/switch.component';
import { TelevisionComponent } from './types/television/television.component';
import { TemperaturesensorComponent } from './types/temperaturesensor/temperaturesensor.component';
import { ThermostatComponent } from './types/thermostat/thermostat.component';
import { ThermostatManageComponent } from './types/thermostat/thermostat.manage.component';
import { UnknownComponent } from './types/unknown/unknown.component';
import { ValveComponent } from './types/valve/valve.component';
import { ValveManageComponent } from './types/valve/valve.manage.component';
import { WindowComponent } from './types/window/window.component';
import { WindowManageComponent } from './types/window/window.manage.component';
import { WindowcoveringComponent } from './types/windowcovering/windowcovering.component';
import { WindowcoveringManageComponent } from './types/windowcovering/windowcovering.manage.component';
import { CoreModule } from '@/app/core/core.module';

@NgModule({
  declarations: [
    AccessoryTileComponent,
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
    SmokesensorComponent,
    ValveComponent,
    ValveManageComponent,
    IrrigationSystemComponent,
    AirpurifierComponent,
    AirpurifierManageComponent,
    HeaterCoolerComponent,
    HeaterCoolerManageComponent,
    HumidifierDehumidifierComponent,
    HumidifierDehumidifierManageComponent,
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
    AccessoryTileComponent,
  ],
  providers: [
    AccessoriesService,
  ],
})
export class AccessoriesCoreModule {}
