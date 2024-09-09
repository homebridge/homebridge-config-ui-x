import { CoreModule } from '@/app/core/core.module'
import { ContainerRestartComponent } from '@/app/modules/platform-tools/docker/container-restart/container-restart.component'
import { DockerRoutingModule } from '@/app/modules/platform-tools/docker/docker-routing.module'
import { StartupScriptComponent } from '@/app/modules/platform-tools/docker/startup-script/startup-script.component'
import { StartupScriptResolver } from '@/app/modules/platform-tools/docker/startup-script/startup-script.resolver'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'

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
export class DockerModule {}
