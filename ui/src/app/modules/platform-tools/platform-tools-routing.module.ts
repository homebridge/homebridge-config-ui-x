import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'docker',
    loadChildren: './docker/docker.module#DockerModule',
  },
  {
    path: 'linux',
    loadChildren: './linux/linux.module#LinuxModule',
  },
  {
    path: 'terminal',
    loadChildren: './terminal/terminal.module#TerminalModule',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PlatformToolsRoutingModule { }
