import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { DragulaModule } from 'ng2-dragula';
import { InlineSVGModule } from 'ng-inline-svg';
import { NouisliderModule } from 'ng2-nouislider';

import { CoreModule } from '../../core/core.module';
import { AccessoriesRoutingModule } from './accessories-routing.module';
import { DragHerePlaceholderComponent } from './drag-here-placeholder/drag-here-placeholder.component';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';
import { InfoModalComponent } from './info-modal/info-modal.component';

import { AccessoriesComponent } from './accessories.component';
import { AccessoriesResolver } from './accessories.resolver';
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

@NgModule({
  declarations: [
    AccessoriesComponent,
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
    DragHerePlaceholderComponent,
    AddRoomModalComponent,
    InfoModalComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent,
    WindowcoveringComponent,
    WindowcoveringManageComponent,
    TelevisionComponent,
    ContactsensorComponent,
  ],
  entryComponents: [
    AddRoomModalComponent,
    InfoModalComponent,
    ThermostatManageComponent,
    LightbulbManageComponent,
    FanManageComponent,
    WindowcoveringManageComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    NouisliderModule,
    NgbModule,
    DragulaModule.forRoot(),
    InlineSVGModule.forRoot(),
    TranslateModule.forChild(),
    CoreModule,
    AccessoriesRoutingModule,
  ],
  providers: [
    AccessoriesResolver,
  ],
})
export class AccessoriesModule { }
