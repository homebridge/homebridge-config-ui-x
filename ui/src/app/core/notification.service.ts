import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  readonly configUpdated = new Subject()
  readonly restartTriggered = new Subject()
  readonly raspberryPiThrottled: Subject<Record<string, boolean>> = new Subject()
}
