import { ContainerRestartComponent } from '@/app/modules/platform-tools/docker/container-restart/container-restart.component'
import { StartupScriptComponent } from '@/app/modules/platform-tools/docker/startup-script/startup-script.component'
import { StartupScriptResolver } from '@/app/modules/platform-tools/docker/startup-script/startup-script.resolver'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'startup-script',
    component: StartupScriptComponent,
    resolve: {
      startupScript: StartupScriptResolver,
    },
  },
  {
    path: 'restart-container',
    component: ContainerRestartComponent,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DockerRoutingModule {}
