import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PluginsComponent } from './plugins.component';

const routes: Routes = [
  {
    path: '',
    component: PluginsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PluginsRoutingModule { }
