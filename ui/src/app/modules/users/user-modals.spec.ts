import type { User } from '@/app/modules/users/users.interface'
import type { FakeApi, FakeAuth } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { ADD_USER_MODAL_DATA, USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { UsersAddComponent } from '@/app/modules/users/users-add/users-add.component'
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component'
import { activeModalStub, fakeApi, makeAuth, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * Adding and editing the UI's own accounts. The interesting rules are the ones
 * that stop an admin locking everybody out: you cannot delete yourself, and
 * you cannot remove the last remaining admin.
 */
describe('user modals', () => {
  let api: FakeApi
  let auth: FakeAuth
  let activeModal: ReturnType<typeof activeModalStub>

  const admin: User = { id: 1, username: 'admin', name: 'Admin', admin: true } as User
  const second: User = { id: 2, username: 'partner', name: 'Partner', admin: true } as User
  const viewer: User = { id: 3, username: 'viewer', name: 'Viewer', admin: false } as User

  function configure(providers: any[] = [], signedInAs = 'admin') {
    TestBed.resetTestingModule()
    api = fakeApi()
    auth = makeAuth({ user: { username: signedInAs } })
    activeModal = activeModalStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({ api, auth, toastr: toastrStub(), activeModal }),
        ...providers,
      ],
    })
  }

  function openAdd(existingUsers: User[] = [admin]): UsersAddComponent {
    configure([{ provide: ADD_USER_MODAL_DATA, useValue: { existingUsers } }])
    const fixture = TestBed.createComponent(UsersAddComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  function openEdit(user: User, existingUsers: User[], signedInAs = 'admin'): UsersEditComponent {
    configure([{ provide: USER_MODAL_DATA, useValue: { user, existingUsers } }], signedInAs)
    const fixture = TestBed.createComponent(UsersEditComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  describe('adding a user', () => {
    it('sends the new account to the server', async () => {
      const modal = openAdd()
      modal.form.setValue({ username: 'partner', name: 'Partner', password: 'secret', passwordConfirm: 'secret', admin: false })

      await modal.onSubmit(modal.form)

      expect(api.lastCall('post', '/users')?.body).toMatchObject({ username: 'partner', name: 'Partner', admin: false })
      expect(activeModal.close).toHaveBeenCalled()
    })

    it.each([
      ['the same name', 'admin'],
      ['a different case', 'Admin'],
      ['surrounding spaces', '  admin  '],
    ])('refuses a username that only differs by %s', (_case, username) => {
      const modal = openAdd([admin])
      modal.form.controls.username.setValue(username)

      // The server lower-cases before comparing, so the form has to as well or
      // the user gets a confusing failure after filling everything in
      expect(modal.form.controls.username.valid).toBe(false)
    })

    it('accepts a username nobody is using', () => {
      const modal = openAdd([admin])
      modal.form.controls.username.setValue('partner')

      expect(modal.form.controls.username.valid).toBe(true)
    })

    it('refuses a password shorter than four characters', () => {
      const modal = openAdd()
      modal.form.controls.password.setValue('abc')

      expect(modal.form.controls.password.valid).toBe(false)
    })

    it('refuses a confirmation that does not match', () => {
      const modal = openAdd()
      modal.form.setValue({ username: 'partner', name: 'Partner', password: 'secret', passwordConfirm: 'different', admin: true })

      expect(modal.form.valid).toBe(false)
    })

    it('creates an admin unless told otherwise', () => {
      expect(openAdd().form.controls.admin.value).toBe(true)
    })

    it('keeps the modal open when the server refuses', async () => {
      const modal = openAdd()
      api.fail('post', '/users', { error: { message: 'Username already taken' } })
      modal.form.setValue({ username: 'partner', name: 'Partner', password: 'secret', passwordConfirm: 'secret', admin: true })

      await modal.onSubmit(modal.form)

      // The user needs their typing back to correct it
      expect(activeModal.close).not.toHaveBeenCalled()
    })
  })

  describe('who can be deleted', () => {
    it('refuses to delete the account you are signed in as', () => {
      const modal = openEdit(admin, [admin, second], 'admin')

      expect(modal.canDelete()).toBe(false)
    })

    it('refuses to delete the last admin', () => {
      const modal = openEdit(admin, [admin, viewer], 'partner')

      // Deleting them would leave nobody able to administer the install
      expect(modal.isLastAdmin()).toBe(true)
      expect(modal.canDelete()).toBe(false)
    })

    it('allows deleting another admin while one remains', () => {
      const modal = openEdit(second, [admin, second], 'admin')

      expect(modal.canDelete()).toBe(true)
    })

    it('allows deleting a non-admin', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')

      expect(modal.canDelete()).toBe(true)
    })
  })

  describe('deleting a user', () => {
    it('takes two steps', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')

      expect(modal.deleteMode()).toBe(false)
    })

    it('deletes rather than saves once confirmed', async () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')
      modal.toggleDeleteMode({ target: document.createElement('button') } as unknown as MouseEvent)

      await modal.onSubmit(modal.form)

      expect(api.lastCall('delete', '/users/3')).toBeDefined()
      expect(api.callsTo('patch')).toHaveLength(0)
    })
  })

  describe('editing a user', () => {
    it('saves the changes against that user', async () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')
      modal.form.controls.name.setValue('Renamed')

      await modal.onSubmit(modal.form)

      expect(api.lastCall('patch', '/users/3')?.body).toMatchObject({ name: 'Renamed' })
    })

    it('signs you out after changing your own username', async () => {
      const modal = openEdit(admin, [admin, second], 'admin')
      modal.form.controls.username.setValue('renamed-admin')

      await modal.onSubmit(modal.form)

      // The token still carries the old username, so the session is stale
      expect(auth.logout).toHaveBeenCalled()
    })

    it('keeps you signed in after changing only your display name', async () => {
      const modal = openEdit(admin, [admin, second], 'admin')
      modal.form.controls.name.setValue('The Admin')

      await modal.onSubmit(modal.form)

      expect(auth.logout).not.toHaveBeenCalled()
    })

    it('lets an admin step down while another admin remains', () => {
      const modal = openEdit(admin, [admin, second], 'admin')

      expect(modal.form.controls.admin.disabled).toBe(false)
    })

    it('will not let the last admin step down', () => {
      const modal = openEdit(admin, [admin, viewer], 'admin')

      // Disabling the control also keeps `admin` out of the request body,
      // so the server is never asked to make the change
      expect(modal.form.controls.admin.disabled).toBe(true)
    })

    it('has nothing to save when the form is untouched', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')

      expect(modal.isFormUnchanged()).toBe(true)
    })

    it('has something to save once a password is typed', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')
      modal.form.controls.password.setValue('newsecret')

      // A password is never read back, so it cannot be compared - typing one
      // always counts as a change
      expect(modal.isFormUnchanged()).toBe(false)
    })

    it('lets a user keep their own name', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')
      modal.form.controls.username.setValue('viewer')

      expect(modal.form.controls.username.valid).toBe(true)
    })

    it('still refuses a name another user already has', () => {
      const modal = openEdit(viewer, [admin, viewer], 'admin')
      modal.form.controls.username.setValue('admin')

      expect(modal.form.controls.username.valid).toBe(false)
    })
  })
})
