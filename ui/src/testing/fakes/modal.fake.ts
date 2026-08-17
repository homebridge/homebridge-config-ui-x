import type { InjectionToken } from '@angular/core'
import type { NgbActiveModal, NgbModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap/modal'
import type { Mock } from 'vitest'

import { vi } from 'vitest'

export interface FakeModalRef {
  componentInstance: Record<string, any>
  result: Promise<any>
  close: (value?: any) => void
  dismiss: (reason?: any) => void
}

export interface OpenedModal {
  content: any
  options: NgbModalOptions | undefined
  ref: FakeModalRef
}

export interface FakeModalService {
  open: Mock<(content: any, options?: NgbModalOptions) => FakeModalRef>
  dismissAll: Mock<(reason?: any) => void>
  hasOpenModals: Mock<() => boolean>

  /** Every modal opened, in order. */
  opened: OpenedModal[]

  /** The most recently opened modal, or undefined. */
  lastOpened: () => OpenedModal | undefined

  /**
   * Read the data a modal was opened with.
   *
   * Openers pass modal data through `createEnvironmentInjector` on the modal
   * options, not through `componentInstance`, so this resolves the token out
   * of that injector.
   * @param token - the modal's data token from core/modal-data-tokens
   * @param index - which opened modal, defaulting to the most recent
   */
  dataFor: <T>(token: InjectionToken<T>, index?: number) => T | undefined
}

/**
 * A stand-in for the NgbActiveModal a modal component injects.
 *
 * Most modal specs assert on these two: callers branch on whether the modal's
 * result resolved (close) or rejected (dismiss).
 */
export function activeModalStub(): NgbActiveModal {
  return {
    close: vi.fn(),
    dismiss: vi.fn(),
  } as unknown as NgbActiveModal
}

/**
 * A controllable modal reference. `result` settles when `close` or `dismiss`
 * is called, matching NgbModalRef - close resolves, dismiss rejects.
 */
export function fakeModalRef(): FakeModalRef {
  let settle: (value: any) => void = () => {}
  let reject: (reason: any) => void = () => {}

  const result = new Promise<any>((resolveFn, rejectFn) => {
    settle = resolveFn
    reject = rejectFn
  })

  // A dismissed modal nobody awaits would otherwise surface as an unhandled
  // rejection and fail an unrelated test
  result.catch(() => {})

  return {
    componentInstance: {},
    result,
    close: vi.fn((value?: any) => settle(value)) as unknown as (value?: any) => void,
    dismiss: vi.fn((reason?: any) => reject(reason)) as unknown as (reason?: any) => void,
  }
}

/**
 * A stand-in for NgbModal, recording what was opened and with what data.
 */
export function modalServiceSpy(): FakeModalService {
  const opened: OpenedModal[] = []

  const modal = {
    opened,
    open: vi.fn((content: any, options?: NgbModalOptions) => {
      const ref = fakeModalRef()
      opened.push({ content, options, ref })
      return ref
    }),
    dismissAll: vi.fn(),
    hasOpenModals: vi.fn(() => opened.length > 0),
  } as FakeModalService

  modal.lastOpened = () => opened.at(-1)

  modal.dataFor = <T>(token: InjectionToken<T>, index?: number) => {
    const entry = index === undefined ? opened.at(-1) : opened[index]
    const injector = entry?.options?.injector
    return injector?.get(token, undefined, { optional: true }) ?? undefined
  }

  return modal
}

/**
 * Convenience cast for providing the spy where NgbModal is injected.
 * @param spy - the spy from modalServiceSpy
 */
export function asNgbModal(spy: FakeModalService): NgbModal {
  return spy as unknown as NgbModal
}
