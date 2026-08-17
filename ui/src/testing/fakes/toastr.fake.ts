import type { ToastrService } from 'ngx-toastr'
import type { Mock } from 'vitest'

import { Subject } from 'rxjs'
import { vi } from 'vitest'

export type ToastLevel = 'error' | 'info' | 'success' | 'warning'

export interface ShownToast {
  level: ToastLevel
  message?: string
  title?: string
  config?: Record<string, any>
  toastId: number
  onTap: Subject<any>
  onHidden: Subject<any>
  onShown: Subject<any>
  onAction: Subject<any>
}

type RaiseToast = (message?: string, title?: string, config?: Record<string, any>) => ShownToast

export interface FakeToastr {
  success: Mock<RaiseToast>
  error: Mock<RaiseToast>
  warning: Mock<RaiseToast>
  info: Mock<RaiseToast>
  show: Mock<RaiseToast>
  clear: Mock<(toastId?: number) => void>
  remove: Mock<(toastId: number) => void>

  /** Every toast raised, in order. */
  shown: ShownToast[]

  /**
   * The toasts raised at one level.
   * @param level - success, error, warning or info
   */
  at: (level: ToastLevel) => ShownToast[]

  /** The most recent toast, or undefined. */
  last: () => ShownToast | undefined
}

/**
 * A stand-in for ToastrService.
 *
 * Each call returns a fresh toast whose `onTap` and `onHidden` are real
 * Subjects, so a spec can fire them: the sidebar, the power options page and
 * the server-time warning all act on those.
 */
export function toastrStub(): FakeToastr {
  const shown: ShownToast[] = []
  let nextId = 1

  const raise = (level: ToastLevel, message?: string, title?: string, config?: Record<string, any>): ShownToast => {
    const toast: ShownToast = {
      level,
      message,
      title,
      config,
      toastId: nextId++,
      onTap: new Subject(),
      onHidden: new Subject(),
      onShown: new Subject(),
      onAction: new Subject(),
    }
    shown.push(toast)
    return toast
  }

  const toastr = {
    shown,
    success: vi.fn((message?: string, title?: string, config?: Record<string, any>) => raise('success', message, title, config)),
    error: vi.fn((message?: string, title?: string, config?: Record<string, any>) => raise('error', message, title, config)),
    warning: vi.fn((message?: string, title?: string, config?: Record<string, any>) => raise('warning', message, title, config)),
    info: vi.fn((message?: string, title?: string, config?: Record<string, any>) => raise('info', message, title, config)),
    show: vi.fn((message?: string, title?: string, config?: Record<string, any>) => raise('info', message, title, config)),
    clear: vi.fn(),
    remove: vi.fn(),
  } as FakeToastr

  toastr.at = (level: ToastLevel) => shown.filter(toast => toast.level === level)
  toastr.last = () => shown.at(-1)

  return toastr
}

/**
 * Convenience cast for providing the stub where ToastrService is injected.
 * @param stub - the stub from toastrStub
 */
export function asToastr(stub: FakeToastr): ToastrService {
  return stub as unknown as ToastrService
}

export interface ToastPackageOptions {
  message?: string
  title?: string
  /** Extra toast config, merged over the defaults. */
  config?: Record<string, any>
}

/**
 * A stand-in for the `ToastPackage` ngx-toastr injects into a custom toast
 * component.
 *
 * ⚠️ Every `toastRef` method the base `Toast` class touches in its constructor
 * has to return a real observable — `afterActivate`, `manualClosed`,
 * `timeoutReset` and `countDuplicate`. A plain `vi.fn()` for any of them throws
 * `.subscribe is not a function` before the component is even built, which
 * reads as the component being broken rather than the stub being short.
 *
 * ⚠️ A toast closing itself does NOT call `manualClose`. `Toast.remove()` marks
 * its own state removed and schedules `ToastrService.remove(toastId)`, so assert
 * on the ToastrService stub's `remove` after flushing timers.
 * @param options - see ToastPackageOptions
 */
export function toastPackageStub(options: ToastPackageOptions = {}) {
  const toastId = 1

  return {
    toastId,
    package: {
      toastId,
      toastType: 'toast-info',
      message: options.message ?? 'Test message',
      title: options.title,
      config: {
        easing: 'ease-in',
        easeTime: 300,
        closeButton: true,
        messageClass: 'toast-message',
        titleClass: 'toast-title',
        ...options.config,
      },
      toastRef: {
        afterActivate: () => new Subject<any>(),
        manualClose: vi.fn(),
        manualClosed: () => new Subject<any>(),
        timeoutReset: () => new Subject<any>(),
        countDuplicate: () => new Subject<any>(),
        activate: vi.fn(),
        close: vi.fn(),
      },
      onTap: () => new Subject<any>(),
      onAction: () => new Subject<any>(),
      triggerTap: vi.fn(),
      triggerAction: vi.fn(),
    },
  }
}
