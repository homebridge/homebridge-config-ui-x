import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'
import type { KioskScope } from '@/app/modules/kiosk/kiosk-scope'

import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'

import { TabletEditComponent } from '@/app/modules/users/users-tablets/tablet-edit.component'
import { TabletPairComponent } from '@/app/modules/users/users-tablets/tablet-pair.component'

/**
 * Add a tablet, preselected to a scope, then show its pairing code. Resolves with the new tablet, or undefined when
 * the add was cancelled.
 */
export async function openAddTablet(modal: NgbModal, scope?: KioskScope): Promise<KioskDevice | undefined> {
  const editRef = modal.open(TabletEditComponent, { size: 'lg', backdrop: 'static' })
  editRef.componentInstance.preselectScope = scope
  let created: KioskDevice
  try {
    created = await editRef.result
  } catch {
    return undefined
  }
  await openPairing(modal, created)
  return created
}

/** Show the pairing code and QR for a tablet */
export async function openPairing(modal: NgbModal, device: KioskDevice): Promise<void> {
  const pairRef = modal.open(TabletPairComponent, { size: 'lg', backdrop: 'static' })
  pairRef.componentInstance.device = device
  try {
    await pairRef.result
  } catch {
    // Dismissed: nothing to do
  }
}
