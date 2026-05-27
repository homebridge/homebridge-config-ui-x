import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { Toast } from 'ngx-toastr'

/**
 * Accessible "restart required" toast.
 *
 * ngx-toastr's built-in toast already announces its message (role="alert") and
 * ships an accessible close button, but it has no custom keyboard-operable
 * action. This component adds a real, focusable "Restart Homebridge" button so
 * keyboard and screen-reader users can trigger the restart, plus the built-in
 * close button to dismiss without restarting. Clicking elsewhere on the toast
 * does nothing — the action is the explicit button.
 *
 * The message text is passed as the toast message and the restart action label
 * as the toast title, so both are already translated by the caller.
 */
@Component({
  selector: '[restart-toast-component]',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './restart-toast.component.html',
  styleUrl: './restart-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    // Component metadata (host/styles) isn't inherited from the base Toast, so
    // re-declare the fade-in/out animation here to match AppToastComponent.
    'animate.enter': 'toast-in',
    '[style.--animation-easing]': 'params.easing',
    '[style.--animation-duration]': 'params.easeTime + "ms"',
    '[class]': 'toastClasses()',
    '[style.display]': 'displayStyle()',
    '(mouseenter)': 'stickAround()',
    '(mouseleave)': 'delayedHideToast()',
  },
})
export class RestartToastComponent extends Toast {
  private $router = inject(Router)

  public restart(): void {
    void this.$router.navigate(['/restart'])
    this.remove()
  }

  public dismiss(): void {
    this.remove()
  }
}
