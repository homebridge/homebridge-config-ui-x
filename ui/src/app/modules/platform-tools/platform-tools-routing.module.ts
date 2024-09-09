import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'docker',
    loadChildren: () => import('./docker/docker.module').then(m => m.DockerModule),
  },
  {
    path: 'linux',
    loadChildren: () => import('./linux/linux.module').then(m => m.LinuxModule),
  },
  {
    path: 'terminal',
    loadChildren: () => import('./terminal/terminal.module').then(m => m.TerminalModule),
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PlatformToolsRoutingModule {}
