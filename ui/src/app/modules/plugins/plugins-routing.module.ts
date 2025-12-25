import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

import { PluginsGuard } from './plugins.guard'

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@/app/modules/plugins/plugins.component').then(m => m.PluginsComponent),
    canDeactivate: [PluginsGuard],
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PluginsRoutingModule {}
