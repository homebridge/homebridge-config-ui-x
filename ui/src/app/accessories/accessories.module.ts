import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UIRouterModule } from '@uirouter/angular';

import { InlineSVGModule } from 'ng-inline-svg';

import { AccessoriesComponent, AccessoriesStates } from './accessories.component';
import { SwitchComponent } from './switch/switch.component';
import { ThermostatComponent } from './thermostat/thermostat.component';
import { OutletComponent } from './outlet/outlet.component';
import { FanComponent } from './fan/fan.component';

@NgModule({
  declarations: [
    AccessoriesComponent,
    SwitchComponent,
    ThermostatComponent,
    OutletComponent,
    FanComponent
  ],
  imports: [
    CommonModule,
    InlineSVGModule,
    UIRouterModule.forChild({
      states: [
        AccessoriesStates
      ]
    })
  ]
})
export class AccessoriesModule { }
