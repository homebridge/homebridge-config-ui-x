import { UsersComponent } from '@/app/modules/users/users.component'
import { UsersResolver } from '@/app/modules/users/users.resolver'
import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    component: UsersComponent,
    resolve: {
      homebridgeUsers: UsersResolver,
    },
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsersRoutingModule {}
