import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AccessoriesComponent } from './accessories.component';
import { AccessoriesResolver } from './accessories.resolver';

const routes: Routes = [
  {
    path: '',
    component: AccessoriesComponent,
    resolve: {
      accessoryLayout: AccessoriesResolver
    }
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AccessoriesRoutingModule { }
