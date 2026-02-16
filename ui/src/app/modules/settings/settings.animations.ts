import { animate, style, transition, trigger } from '@angular/animations'

export const settingsAnimations = [
  trigger('fadeInOut', [
    transition(':enter', [
      style({ opacity: 0 }),
      animate('750ms', style({ opacity: 1 })),
    ]),
    transition(':leave', [
      animate('750ms', style({ opacity: 0 })),
    ]),
  ]),
  trigger('smoothHide', [
    transition(':enter', [
      style({
        opacity: 0.01,
        height: '0px',
        marginBottom: 0,
        transform: 'scale(0.97)',
      }),
      animate('450ms cubic-bezier(0.0, 0.0, 0.2, 1)', style({
        opacity: 1,
        height: '*',
        marginBottom: '*',
        transform: 'scale(1)',
      })),
    ]),
    transition(':leave', [
      animate('150ms cubic-bezier(0.4, 0.0, 1, 1)', style({
        opacity: 0,
        height: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        transform: 'scale(0.98)',
      })),
    ]),
  ]),
]
