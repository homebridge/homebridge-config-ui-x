import { NgModule } from '@angular/core'
import { RouterModule, Routes } from '@angular/router'

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@/app/modules/platform-tools/terminal/terminal.component').then(m => m.TerminalComponent),
    canDeactivate: [(component: any) => component.canDeactivate ? component.canDeactivate() : true],
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TerminalRoutingModule {}
