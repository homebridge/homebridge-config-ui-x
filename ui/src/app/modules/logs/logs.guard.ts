import { Injectable } from '@angular/core'
import { ActivatedRouteSnapshot, CanDeactivate, RouterStateSnapshot } from '@angular/router'
import { Observable } from 'rxjs'

import { CanComponentDeactivate } from './logs.component'

@Injectable({
  providedIn: 'root',
})
export class LogsGuard implements CanDeactivate<CanComponentDeactivate> {
  canDeactivate(
    component: CanComponentDeactivate,
    currentRoute: ActivatedRouteSnapshot,
    currentState: RouterStateSnapshot,
    nextState?: RouterStateSnapshot,
  ): Observable<boolean> | Promise<boolean> | boolean {
    return component.canDeactivate ? component.canDeactivate(nextState?.url) : true
  }
}
