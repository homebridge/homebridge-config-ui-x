import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { UIRouterModule } from '@uirouter/angular';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { AceEditorModule } from 'ng2-ace-editor';

import { SpinnerModule } from '../spinner/spinner.module';

import { StartupScriptEditorComponent, StartupScriptEditorStates } from './startup-script-editor/startup-script-editor.component';
import { RestartContainerComponent, RestartContainerState} from './restart-container/restart-container.component';
import { TerminalComponent, TerminalState } from './terminal/terminal.component';

@NgModule({
  imports: [
    CommonModule,
    NgbModule,
    AceEditorModule,
    SpinnerModule,
    UIRouterModule.forChild({
      states: [
        StartupScriptEditorStates,
        RestartContainerState,
        TerminalState
      ]
    })
  ],
  declarations: [
    StartupScriptEditorComponent,
    RestartContainerComponent,
    TerminalComponent
  ]
})
export class DockerToolsModule { }
