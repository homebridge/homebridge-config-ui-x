import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

import { LogsGuard } from './logs.guard'

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@/app/modules/logs/logs.component').then(m => m.LogsComponent),
    canDeactivate: [LogsGuard],
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LogsRoutingModule {}
