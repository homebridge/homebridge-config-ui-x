import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AccessoriesComponent } from './accessories.component';

const routes: Routes = [
  {
    path: '',
    component: AccessoriesComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AccessoriesRoutingModule { }
