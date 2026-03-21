import { Injectable, signal } from '@angular/core'

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  readonly raspberryPiThrottled = signal<Record<string, boolean>>({})
  readonly formAuthEnabled = signal<boolean | null>(null)
  readonly legacyOtpDetected = signal(false)
}
