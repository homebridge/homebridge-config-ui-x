import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { LinuxComponent } from './linux.component';

const routes: Routes = [
  {
    path: '',
    component: LinuxComponent,
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class LinuxRoutingModule { }
