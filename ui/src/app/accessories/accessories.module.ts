import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslateModule } from '@ngx-translate/core';
import { UIRouterModule } from '@uirouter/angular';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { DragulaModule } from 'ng2-dragula';
import { InlineSVGModule } from 'ng-inline-svg';
import { NouisliderModule } from 'ng2-nouislider';

import { LongClickDirective } from './longclick.directive';

import { DragHerePlaceholderComponent } from './drag-here-placeholder/drag-here-placeholder.component';
import { AddRoomModalComponent } from './add-room-modal/add-room-modal.component';
import { InfoModalComponent } from './info-modal/info-modal.component';
import { CustomPipesModule } from '../_pipes/custom-pipes.module';

import { AccessoriesComponent, AccessoriesStates } from './accessories.component';
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
    LongClickDirective,
    DragHerePlaceholderComponent,
    AddRoomModalComponent,
    InfoModalComponent,
    HumiditysensorComponent,
    AirqualitysensorComponent
  ],
  entryComponents: [
    AddRoomModalComponent,
    InfoModalComponent,
    ThermostatManageComponent,
    LightbulbManageComponent,
    FanManageComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    NouisliderModule,
    NgbModule,
    DragulaModule.forRoot(),
    InlineSVGModule.forRoot(),
    TranslateModule.forChild(),
    UIRouterModule.forChild({
      states: [
        AccessoriesStates
      ]
    }),
    CustomPipesModule,
  ]
})
export class AccessoriesModule { }
