import { AccessoriesComponent } from '@/app/modules/accessories/accessories.component'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    component: AccessoriesComponent,
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccessoriesRoutingModule {}
