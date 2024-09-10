import { Injectable } from '@angular/core'
import { Subject } from 'rxjs'

const readyEvent = new Subject()

@Injectable({
  providedIn: 'root',
})
export class MonacoEditorService {
  public readyEvent: Subject<any>

  constructor() {
    this.readyEvent = readyEvent
  }
}

export function onMonacoLoad() {
  readyEvent.next(undefined)
}
