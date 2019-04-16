import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AceEditorModule } from 'ng2-ace-editor';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

import { CoreModule } from '../../../core/core.module';
import { DockerRoutingModule } from './docker-routing.module';
import { StartupScriptComponent } from './startup-script/startup-script.component';
import { ContainerRestartComponent } from './container-restart/container-restart.component';
import { ContainerSettingsComponent } from './container-settings/container-settings.component';
import { StartupScriptResolver } from './startup-script/startup-script.resolver';
import { ContainerSettingsResolver } from './container-settings/container-settings.resolver';

@NgModule({
  declarations: [
    StartupScriptComponent,
    ContainerRestartComponent,
    ContainerSettingsComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AceEditorModule,
    NgbModule,
    TranslateModule.forChild(),
    CoreModule,
    DockerRoutingModule,
  ],
  providers: [
    StartupScriptResolver,
    ContainerSettingsResolver,
  ],
})
export class DockerModule { }
