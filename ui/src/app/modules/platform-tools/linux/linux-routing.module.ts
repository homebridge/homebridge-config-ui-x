import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LinuxComponent } from './linux.component';
import { RestartLinuxComponent } from './restart-linux/restart-linux.component';
import { ShutdownLinuxComponent } from './shutdown-linux/shutdown-linux.component';

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
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LinuxRoutingModule { }
