import { PowerOptionsComponent } from '@/app/modules/power-options/power-options.component'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    component: PowerOptionsComponent,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PowerOptionsRoutingModule {}
