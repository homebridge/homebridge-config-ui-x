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
    loadComponent: () => import('@/app/modules/platform-tools/docker/startup-script/startup-script.component').then(m => m.StartupScriptComponent),
    resolve: {
      startupScript: StartupScriptResolver,
    },
  },
  {
    path: 'restart-container',
    loadComponent: () => import('@/app/modules/platform-tools/docker/container-restart/container-restart.component').then(m => m.ContainerRestartComponent),
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DockerRoutingModule {}
