import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RestartComponent } from './restart.component';

const routes: Routes = [
  {
    path: '',
    component: RestartComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class RestartRoutingModule { }
