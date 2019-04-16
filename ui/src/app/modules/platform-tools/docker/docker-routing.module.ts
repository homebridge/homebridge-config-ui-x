import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ContainerSettingsComponent } from './container-settings/container-settings.component';
import { StartupScriptComponent } from './startup-script/startup-script.component';
import { ContainerRestartComponent } from './container-restart/container-restart.component';
import { StartupScriptResolver } from './startup-script/startup-script.resolver';
import { ContainerSettingsResolver } from './container-settings/container-settings.resolver';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'settings',
    component: ContainerSettingsComponent,
    resolve: {
      env: ContainerSettingsResolver,
    },
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
