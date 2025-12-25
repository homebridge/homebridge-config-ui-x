import { NgModule } from '@angular/core'
import { ActivatedRouteSnapshot, CanDeactivateFn, RouterModule, RouterStateSnapshot, Routes } from '@angular/router'

import { TerminalComponent } from './terminal.component'

const canDeactivateTerminal: CanDeactivateFn<TerminalComponent> = (
  component: TerminalComponent,
  currentRoute: ActivatedRouteSnapshot,
  currentState: RouterStateSnapshot,
  nextState?: RouterStateSnapshot,
) => {
  return component.canDeactivate ? component.canDeactivate(nextState?.url) : true
}

const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@/app/modules/platform-tools/terminal/terminal.component').then(m => m.TerminalComponent),
    canDeactivate: [canDeactivateTerminal],
  },
]

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TerminalRoutingModule {}
