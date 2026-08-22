import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

/**
 * Shown by the app shell while the very first settings load is still failing.
 *
 * ⚠️ Deliberately eager, not lazy loaded. The one time this renders is when the
 * server cannot be reached - which is also the one time a lazy chunk could not
 * be fetched.
 */
@Component({
  selector: 'app-server-unreachable',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './server-unreachable.component.html',
  styleUrl: './server-unreachable.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerUnreachableComponent {
  private destroyRef = inject(DestroyRef)

  // A restart is usually over well inside this, so anything longer is worth a
  // nudge towards the logs rather than leaving the user watching an animation.
  private static readonly TAKING_LONG_MS = 30000

  public readonly takingLong = signal(false)

  constructor() {
    const timer = setTimeout(() => this.takingLong.set(true), ServerUnreachableComponent.TAKING_LONG_MS)
    this.destroyRef.onDestroy(() => clearTimeout(timer))
  }
}
