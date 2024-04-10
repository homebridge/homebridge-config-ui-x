import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component';

const routes: Routes = [
  {
    path: '',
    component: PowerOptionsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PowerOptionsRoutingModule {}
