import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UIRouterModule } from '@uirouter/angular';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { InlineSVGModule } from 'ng-inline-svg';
import { NouisliderModule } from 'ng2-nouislider';

import { LongClickDirective } from './longclick.directive';

import { AccessoriesComponent, AccessoriesStates } from './accessories.component';
import { SwitchComponent } from './switch/switch.component';
import { ThermostatComponent } from './thermostat/thermostat.component';
import { ThermostatManageComponent } from './thermostat/thermostat.manage.component';
import { OutletComponent } from './outlet/outlet.component';
import { FanComponent } from './fan/fan.component';
import { FanManageComponent } from './fan/fan.manage.component';
import { UnknownComponent } from './unknown/unknown.component';
import { LightbulbComponent } from './lightbulb/lightbulb.component';
import { LightbulbManageComponent } from './lightbulb/lightbulb.manage.component';
import { LockmechanismComponent } from './lockmechanism/lockmechanism.component';
import { TemperaturesensorComponent } from './temperaturesensor/temperaturesensor.component';
import { GaragedooropenerComponent } from './garagedooropener/garagedooropener.component';
import { MotionsensorComponent } from './motionsensor/motionsensor.component';
import { OccupancysensorComponent } from './occupancysensor/occupancysensor.component';

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
    LongClickDirective
  ],
  entryComponents: [
    ThermostatManageComponent,
    LightbulbManageComponent,
    FanManageComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    InlineSVGModule,
    NouisliderModule,
    NgbModule,
    UIRouterModule.forChild({
      states: [
        AccessoriesStates
      ]
    })
  ]
})
export class AccessoriesModule { }
