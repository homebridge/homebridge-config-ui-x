import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { InstalledPluginsComponent } from './installed-plugins/installed-plugins.component';
import { SearchPluginsComponent } from './search-plugins/search-plugins.component';

const routes: Routes = [
  {
    path: '',
    component: InstalledPluginsComponent,
  },
  {
    path: 'search/:query',
    component: SearchPluginsComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PluginsRoutingModule { }
