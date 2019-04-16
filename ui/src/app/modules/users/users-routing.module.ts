import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { UsersComponent } from './users.component';
import { UsersResolver } from './users.resolver';

const routes: Routes = [
  {
    path: '',
    component: UsersComponent,
    resolve: {
      homebridgeUsers: UsersResolver,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UsersRoutingModule { }
