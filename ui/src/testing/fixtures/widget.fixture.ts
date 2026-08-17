import type { Widget } from '@/app/modules/status/widgets/widgets.interfaces'

import { Subject } from 'rxjs'

/**
 * A dashboard widget definition.
 *
 * The three `$` fields are fresh Subjects every call. The widget loader
 * assigns `$resizeEvent` and `$configureEvent` as plain properties rather than
 * inputs, so a widget spec must set them before `ngOnInit` runs.
 * @param overrides - fields to change
 */
export function makeWidget(overrides: Partial<Widget> = {}): Widget {
  return {
    $configureEvent: new Subject<void>(),
    $resizeEvent: new Subject<void>(),
    $saveWidgetsEvent: new Subject<void>(),
    component: 'HomebridgeStatusWidgetComponent',
    cols: 4,
    rows: 4,
    x: 0,
    y: 0,
    draggable: false,
    hideOnDesktop: false,
    hideOnMobile: false,
    mobileOrder: 0,
    ...overrides,
  }
}
