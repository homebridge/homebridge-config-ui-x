import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { UIRouterModule, StateDeclaration } from '@uirouter/angular';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AceEditorModule } from 'ng2-ace-editor';

import { SpinnerModule } from '../../spinner/spinner.module';

import { TerminalComponent } from '../terminal/terminal.component';
import { StartupScriptEditorComponent, StartupScriptEditorStates } from './startup-script-editor/startup-script-editor.component';
import { RestartContainerComponent, RestartContainerState} from './restart-container/restart-container.component';
import { SettingsComponent, SettingsState } from './settings/settings.component';

export const AbstractState: StateDeclaration = {
  name: 'docker',
  url: '/docker',
  redirectTo: 'status',
  data: {
    requiresAuth: true,
    requiresAdmin: true
  },
};

export const TerminalState = {
  name: 'docker.terminal',
  url: '/terminal',
  views: {
    '!$default': { component: TerminalComponent }
  },
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    NgbModule,
    AceEditorModule,
    SpinnerModule,
    UIRouterModule.forChild({
      states: [
        AbstractState,
        StartupScriptEditorStates,
        RestartContainerState,
        TerminalState,
        SettingsState
      ]
    })
  ],
  declarations: [
    StartupScriptEditorComponent,
    RestartContainerComponent,
    SettingsComponent
  ]
})
export class DockerToolsModule { }
