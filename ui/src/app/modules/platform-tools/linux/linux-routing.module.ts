import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    redirectTo: '/',
    pathMatch: 'full',
  },
  {
    path: 'restart-server',
    loadComponent: () => import('@/app/modules/platform-tools/linux/restart-linux/restart-linux.component').then(m => m.RestartLinuxComponent),
  },
  {
    path: 'shutdown-server',
    loadComponent: () => import('@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component').then(m => m.ShutdownLinuxComponent),
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LinuxRoutingModule {}
