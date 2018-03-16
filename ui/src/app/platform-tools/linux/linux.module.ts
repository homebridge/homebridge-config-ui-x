import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UIRouterModule, StateDeclaration } from '@uirouter/angular';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AceEditorModule } from 'ng2-ace-editor';

import { SpinnerModule } from '../../spinner/spinner.module';

import { RestartServerComponent, RestartServerState } from './restart-server/restart-server.component';
import { ShutdownServerComponent, ShutdownServerState } from './shutdown-server/shutdown-server.component';

export const AbstractState: StateDeclaration = {
  name: 'linux',
  url: '/linux',
  redirectTo: 'status',
  data: {
    requiresAuth: true,
    requiresAdmin: true
  },
};

@NgModule({
  imports: [
    CommonModule,
    NgbModule,
    AceEditorModule,
    SpinnerModule,
    UIRouterModule.forChild({
      states: [
        AbstractState,
        RestartServerState,
        ShutdownServerState
      ]
    })
  ],
  declarations: [
    RestartServerComponent,
    ShutdownServerComponent
  ]
})
export class LinuxToolsModule { }
