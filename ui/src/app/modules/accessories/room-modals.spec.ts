import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { AddRoomComponent } from '@/app/modules/accessories/add-room/add-room.component'
import { EditRoomComponent } from '@/app/modules/accessories/edit-room/edit-room.component'
import { ADD_ROOM_MODAL_DATA, EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'
import { activeModalStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Adding and renaming the rooms on the accessories page.
 *
 * Rooms are a UI-only grouping - Homebridge knows nothing about them - so the
 * rules are all about keeping the list coherent. Exactly one room is the default,
 * which is where a newly discovered accessory lands, so the default cannot be
 * un-set and the last remaining room cannot stop being it. Deleting a room has to
 * say where its accessories are going, because they are not deleted with it.
 */
describe('the room modals', () => {
  let activeModal: ReturnType<typeof activeModalStub>

  /**
   * Build the add-room modal.
   * @param existingRooms - the rooms already on the page
   */
  async function openAdd(existingRooms: Array<{ name: string, isDefault?: boolean }>) {
    TestBed.resetTestingModule()
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ activeModal }),
        { provide: ADD_ROOM_MODAL_DATA, useValue: { existingRooms } },
      ],
    })

    const fixture = TestBed.createComponent(AddRoomComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  /**
   * Build the edit-room modal for one room.
   * @param existingRooms - the rooms already on the page
   * @param currentRoomIndex - which of them is being edited
   */
  async function openEdit(
    existingRooms: Array<{ name: string, isDefault?: boolean }>,
    currentRoomIndex: number,
  ) {
    TestBed.resetTestingModule()
    activeModal = activeModalStub()
    const room = existingRooms[currentRoomIndex]

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ activeModal }),
        {
          provide: EDIT_ROOM_MODAL_DATA,
          useValue: {
            roomName: room.name,
            isDefault: !!room.isDefault,
            existingRooms,
            currentRoomIndex,
          },
        },
      ],
    })

    const fixture = TestBed.createComponent(EditRoomComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    return fixture.componentInstance
  }

  /** A mouse event whose target can be blurred. */
  function clickEvent(): MouseEvent {
    return { target: document.createElement('button') } as unknown as MouseEvent
  }

  const threeRooms = [
    { name: 'Default Room', isDefault: true },
    { name: 'Kitchen' },
    { name: 'Hall' },
  ]

  describe('adding a room', () => {
    it('needs a name', async () => {
      const modal = await openAdd(threeRooms)

      expect(modal.roomForm.invalid).toBe(true)

      modal.roomForm.patchValue({ roomName: 'Bedroom' })
      expect(modal.roomForm.valid).toBe(true)
    })

    it('closes with the name and the default flag', async () => {
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: 'Bedroom', isDefault: true })

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalledWith({ name: 'Bedroom', isDefault: true })
    })

    it('trims the name the user typed', async () => {
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: '  Bedroom  ' })

      modal.closeModal()

      // The name is what appears as a heading, and a padded one is impossible to
      // spot as the reason two rooms look identical
      expect(activeModal.close).toHaveBeenCalledWith({ name: 'Bedroom', isDefault: false })
    })

    it('refuses a name another room already has', async () => {
      const modal = await openAdd(threeRooms)

      modal.roomForm.patchValue({ roomName: 'Kitchen' })

      expect(modal.roomForm.controls.roomName.errors).toEqual({ duplicateRoom: true })
    })

    it('ignores case and padding when comparing names', async () => {
      const modal = await openAdd(threeRooms)

      modal.roomForm.patchValue({ roomName: '  kITCHEN ' })

      // Two rooms called Kitchen and kitchen are indistinguishable on the page
      expect(modal.roomForm.controls.roomName.errors).toEqual({ duplicateRoom: true })
    })

    it('does not claim a blank name is a duplicate', async () => {
      const modal = await openAdd(threeRooms)

      modal.roomForm.patchValue({ roomName: '   ' })

      // The duplicate check skips a name that trims to nothing, so the user is
      // not told a room called "   " already exists
      expect(modal.roomForm.controls.roomName.errors?.duplicateRoom).toBeUndefined()
    })

    it('will not create a room named only spaces', async () => {
      // ⚠️ `Validators.required` only rejects null and the empty string, so a
      // value of spaces alone counted as a name - and `closeModal` trims it, so
      // the room was created with no name at all and could not be told apart from
      // any other unnamed room on the page
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: '   ' })

      modal.closeModal()

      expect(modal.roomForm.invalid).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('still accepts a name with spaces around it', async () => {
      // Only blank names are rejected; the padding is trimmed off as before
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: '  Utility Room  ' })

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalledWith({ name: 'Utility Room', isDefault: false })
    })

    it('accepts a name of a single character', async () => {
      // The rule is "not blank", not "long enough"
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: 'X' })

      expect(modal.roomForm.valid).toBe(true)
    })

    it('will not close while the name is unusable', async () => {
      const modal = await openAdd(threeRooms)
      modal.roomForm.patchValue({ roomName: 'Kitchen' })

      modal.closeModal()

      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('makes the very first room the default', async () => {
      const modal = await openAdd([])

      // Something has to be the default, and there is nothing else to be it
      expect(modal.roomForm.value.isDefault).toBe(true)
      expect(modal.noExistingRooms).toBe(true)
    })

    it('does not force the default when rooms already exist', async () => {
      const modal = await openAdd(threeRooms)

      expect(modal.roomForm.value.isDefault).toBe(false)
      expect(modal.noExistingRooms).toBe(false)
    })
  })

  describe('renaming a room', () => {
    it('starts from the room as it is', async () => {
      const modal = await openEdit(threeRooms, 1)

      expect(modal.roomForm.getRawValue()).toEqual({ roomName: 'Kitchen', isDefault: false })
      expect(modal.isFormUnchanged()).toBe(true)
    })

    it('notices the name being changed', async () => {
      const modal = await openEdit(threeRooms, 1)

      modal.roomForm.patchValue({ roomName: 'Kitchenette' })

      expect(modal.isFormUnchanged()).toBe(false)
    })

    it('does not count its own name as a duplicate', async () => {
      const modal = await openEdit(threeRooms, 1)

      // The room being edited is skipped by index, so saving without renaming
      // must not report a clash with itself
      expect(modal.roomForm.controls.roomName.errors).toBeNull()
    })

    it('still refuses the name of another room', async () => {
      const modal = await openEdit(threeRooms, 1)

      modal.roomForm.patchValue({ roomName: 'Hall' })

      expect(modal.roomForm.controls.roomName.errors).toEqual({ duplicateRoom: true })
    })

    it('closes with the new name and the default flag', async () => {
      const modal = await openEdit(threeRooms, 1)
      modal.roomForm.patchValue({ roomName: 'Kitchenette', isDefault: true })

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalledWith({ name: 'Kitchenette', isDefault: true })
    })

    it('will not close on an invalid name', async () => {
      const modal = await openEdit(threeRooms, 1)
      modal.roomForm.patchValue({ roomName: '' })

      modal.closeModal()

      expect(activeModal.close).not.toHaveBeenCalled()
    })

    it('will not rename a room to nothing but spaces', async () => {
      // The same gap as on the add modal: it would have saved a room with no name
      const modal = await openEdit(threeRooms, 1)
      modal.roomForm.patchValue({ roomName: '   ' })

      modal.closeModal()

      expect(modal.roomForm.invalid).toBe(true)
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('which room is the default', () => {
    it('will not let the default room stop being the default', async () => {
      const modal = await openEdit(threeRooms, 0)

      // Exactly one room has to be the default, and un-ticking this leaves none
      expect(modal.roomForm.controls.isDefault.disabled).toBe(true)
    })

    it('will not let the only room stop being the default', async () => {
      const modal = await openEdit([{ name: 'Default Room', isDefault: true }], 0)

      expect(modal.isOnlyRoom()).toBe(true)
      expect(modal.roomForm.controls.isDefault.disabled).toBe(true)
    })

    it('lets an ordinary room be promoted', async () => {
      const modal = await openEdit(threeRooms, 1)

      expect(modal.roomForm.controls.isDefault.disabled).toBe(false)
    })

    it('includes the disabled default flag when closing', async () => {
      const modal = await openEdit(threeRooms, 0)
      modal.roomForm.patchValue({ roomName: 'Renamed Default' })

      modal.closeModal()

      // Read with getRawValue, because a disabled control is missing from the
      // ordinary form value - the room would silently stop being the default
      expect(activeModal.close).toHaveBeenCalledWith({ name: 'Renamed Default', isDefault: true })
    })
  })

  describe('deleting a room', () => {
    it('says where the accessories will go', async () => {
      const modal = await openEdit(threeRooms, 1)

      // They are moved to the default room, not deleted with it
      expect(modal.targetRoomName()).toBe('Default Room')
    })

    it('moves them to the first other room when deleting the default', async () => {
      const modal = await openEdit(threeRooms, 0)

      // There is no default to move them to, so the room that is about to
      // become the default takes them
      expect(modal.targetRoomName()).toBe('Kitchen')
      expect(modal.newDefaultRoomName()).toBe('Kitchen')
    })

    it('names no new default when an ordinary room is deleted', async () => {
      const modal = await openEdit(threeRooms, 1)

      expect(modal.newDefaultRoomName()).toBe('')
    })

    it('falls back to the first room when nothing is marked default', async () => {
      const modal = await openEdit([{ name: 'Kitchen' }, { name: 'Hall' }], 1)

      // An older saved layout may have no default at all
      expect(modal.targetRoomName()).toBe('Kitchen')
    })

    it('locks the form while the delete is being confirmed', async () => {
      const modal = await openEdit(threeRooms, 1)

      modal.toggleDeleteMode(clickEvent())

      // The name boxes are still on screen, and editing them while confirming a
      // delete would be meaningless
      expect(modal.deleteMode()).toBe(true)
      expect(modal.roomForm.disabled).toBe(true)
    })

    it('closes with a delete instruction rather than a room', async () => {
      const modal = await openEdit(threeRooms, 1)
      modal.toggleDeleteMode(clickEvent())

      modal.closeModal()

      expect(activeModal.close).toHaveBeenCalledWith({ delete: true })
    })

    it('deletes even when the name was left invalid', async () => {
      const modal = await openEdit(threeRooms, 1)
      modal.roomForm.patchValue({ roomName: '' })

      modal.toggleDeleteMode(clickEvent())
      modal.closeModal()

      // The name is about to stop existing, so refusing to delete over it would
      // trap the user
      expect(modal.formWasInvalid()).toBe(true)
      expect(activeModal.close).toHaveBeenCalledWith({ delete: true })
    })

    it('re-enables the form when the delete is called off', async () => {
      const modal = await openEdit(threeRooms, 1)

      modal.toggleDeleteMode(clickEvent())
      modal.toggleDeleteMode(clickEvent())

      expect(modal.deleteMode()).toBe(false)
      expect(modal.roomForm.controls.roomName.enabled).toBe(true)
    })

    it('keeps the default flag locked after backing out', async () => {
      const modal = await openEdit(threeRooms, 0)

      modal.toggleDeleteMode(clickEvent())
      modal.toggleDeleteMode(clickEvent())

      // Re-enabling the whole form would quietly hand back a checkbox that must
      // stay locked
      expect(modal.roomForm.controls.isDefault.disabled).toBe(true)
      expect(modal.roomForm.controls.roomName.enabled).toBe(true)
    })
  })
})
