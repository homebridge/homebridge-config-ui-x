import { RestartLinuxComponent } from '@/app/modules/platform-tools/linux/restart-linux/restart-linux.component'
import { ShutdownLinuxComponent } from '@/app/modules/platform-tools/linux/shutdown-linux/shutdown-linux.component'
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
    component: RestartLinuxComponent,
  },
  {
    path: 'shutdown-server',
    component: ShutdownLinuxComponent,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LinuxRoutingModule {}
