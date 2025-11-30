import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  readonly raspberryPiThrottled: Subject<Record<string, boolean>> = new Subject()
  readonly formAuthEnabled: Subject<boolean> = new Subject()
}
