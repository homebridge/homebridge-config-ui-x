import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ContainerRestartComponent } from './container-restart/container-restart.component';
import { StartupScriptComponent } from './startup-script/startup-script.component';
import { StartupScriptResolver } from './startup-script/startup-script.resolver';

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
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DockerRoutingModule { }
