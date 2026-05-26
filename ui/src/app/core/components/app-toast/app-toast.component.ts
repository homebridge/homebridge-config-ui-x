import { ChangeDetectionStrategy, Component } from '@angular/core'
import { Toast } from 'ngx-toastr'

// ngx-toastr's default template gives the message both a role="alert"
// live region AND an aria-label that duplicates the visible text, so
// VoiceOver reads each toast three times. This subclass drops the
// redundant aria-label (and the title's) but keeps role="alert" on the
// message — that is what actually drives the announcement, so the toast
// is now read exactly once.
@Component({
  selector: '[toast-component]',
  standalone: true,
  templateUrl: './app-toast.component.html',
  styleUrl: './app-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'animate.enter': 'toast-in',
    '[style.--animation-easing]': 'params.easing',
    '[style.--animation-duration]': 'params.easeTime + "ms"',
    '[class]': 'toastClasses()',
    '[style.display]': 'displayStyle()',
    '(mouseenter)': 'stickAround()',
    '(mouseleave)': 'delayedHideToast()',
    '(click)': 'tapToast()',
  },
})
export class AppToastComponent extends Toast {}
