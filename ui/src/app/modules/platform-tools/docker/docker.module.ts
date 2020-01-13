import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { MonacoEditorModule } from 'ngx-monaco-editor';

import { CoreModule } from '../../../core/core.module';
import { DockerRoutingModule } from './docker-routing.module';
import { StartupScriptComponent } from './startup-script/startup-script.component';
import { ContainerRestartComponent } from './container-restart/container-restart.component';
import { StartupScriptResolver } from './startup-script/startup-script.resolver';

@NgModule({
  declarations: [
    StartupScriptComponent,
    ContainerRestartComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MonacoEditorModule,
    NgbModule,
    TranslateModule.forChild(),
    CoreModule,
    DockerRoutingModule,
  ],
  providers: [
    StartupScriptResolver,
  ],
})
export class DockerModule { }
