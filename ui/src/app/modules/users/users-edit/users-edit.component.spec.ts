import type { FakeApi, FakeAuth, FakeToastr } from '@/testing'
import type { AbstractControl } from '@angular/forms'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormGroup } from '@angular/forms'
import { TranslatePipe } from '@ngx-translate/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { UsersEditComponent } from '@/app/modules/users/users-edit/users-edit.component'
import { fakeApi, makeAuth, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The validator is passed to the FormGroup unbound and never touches `this`,
 * so it can be taken straight off the prototype.
 */
const matchPassword = (UsersEditComponent.prototype as any).matchPassword as (control: AbstractControl) => Record<string, boolean> | null

/**
 * A password pair, optionally carrying an error another validator already set.
 * @param password - the password field value
 * @param passwordConfirm - the confirmation field value
 * @param existingErrors - errors already on the confirmation control
 */
function passwordGroup(password: string, passwordConfirm: string, existingErrors: Record<string, boolean> | null = null) {
  const confirm = new FormControl(passwordConfirm)
  if (existingErrors) {
    confirm.setErrors(existingErrors)
  }
  return new FormGroup({
    password: new FormControl(password),
    passwordConfirm: confirm,
  })
}

describe('UsersEditComponent', () => {
  describe('matchPassword', () => {
    it('passes when the two fields agree', () => {
      const group = passwordGroup('correct horse', 'correct horse')

      expect(matchPassword(group)).toBeNull()
      expect(group.get('passwordConfirm')!.errors).toBeNull()
    })

    it('fails the group and the confirmation field when they differ', () => {
      const group = passwordGroup('correct horse', 'battery staple')

      expect(matchPassword(group)).toEqual({ matchPassword: true })
      expect(group.get('passwordConfirm')!.errors).toEqual({ matchPassword: true })
    })

    it('keeps an error another validator already set', () => {
      // The regression this guards: overwriting errors wholesale would clear
      // `required`, so an empty confirmation box would look valid
      const group = passwordGroup('correct horse', '', { required: true })

      matchPassword(group)

      expect(group.get('passwordConfirm')!.errors).toEqual({ required: true, matchPassword: true })
    })

    it('clears only its own error once the fields agree', () => {
      const group = passwordGroup('correct horse', 'correct horse', { required: true, matchPassword: true })

      expect(matchPassword(group)).toBeNull()
      expect(group.get('passwordConfirm')!.errors).toEqual({ required: true })
    })

    it('clears the errors entirely when nothing else is wrong', () => {
      const group = passwordGroup('correct horse', 'correct horse', { matchPassword: true })

      matchPassword(group)

      expect(group.get('passwordConfirm')!.errors).toBeNull()
    })

    it('treats two empty fields as matching', () => {
      expect(matchPassword(passwordGroup('', ''))).toBeNull()
    })
  })

  /**
   * Editing and deleting a user.
   *
   * ⚠️ **Two safety rails matter here.** The last admin cannot be demoted or
   * deleted, or nobody can administer the box again; and renaming *yourself* has to
   * sign you out, because the token in your browser names a user that no longer
   * exists.
   */
  describe('editing a user', () => {
    let api: FakeApi
    let auth: FakeAuth
    let toastr: FakeToastr
    let activeModal: { close: ReturnType<typeof vi.fn>, dismiss: ReturnType<typeof vi.fn> }

    /**
     * Open the modal on a user.
     * @param options - how to set it up
     * @param options.user - the user being edited
     * @param options.existingUsers - everyone on the box
     * @param options.signedInAs - the username of the signed-in user
     */
    function open(options: { user?: any, existingUsers?: any[], signedInAs?: string } = {}) {
      const user = options.user ?? { id: 2, username: 'someone', name: 'Someone', admin: false }
      TestBed.resetTestingModule()
      api = fakeApi()
      auth = makeAuth({ user: { username: options.signedInAs ?? 'admin', admin: true } })
      toastr = toastrStub()
      activeModal = { close: vi.fn(), dismiss: vi.fn() }

      TestBed.configureTestingModule({
        imports: [UsersEditComponent],
        providers: [
          provideTestTranslate(),
          provideFakes({ api, auth, toastr, activeModal }),
          {
            provide: USER_MODAL_DATA,
            useValue: {
              user,
              existingUsers: options.existingUsers ?? [
                { id: 1, username: 'admin', name: 'Admin', admin: true },
                user,
              ],
            },
          },
        ],
      })

      TestBed.overrideComponent(UsersEditComponent, {
        set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
      })

      const fixture = TestBed.createComponent(UsersEditComponent)
      fixture.detectChanges()
      return fixture.componentInstance
    }

    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(console.error).mockClear()
    })

    it('starts from the user as they are', () => {
      const modal = open({ user: { id: 2, username: 'someone', name: 'Someone', admin: true } })

      expect(modal.form.getRawValue()).toMatchObject({ username: 'someone', name: 'Someone', admin: true })
      expect(modal.isFormUnchanged()).toBe(true)
    })

    it('saves the changes to that user', async () => {
      const modal = open()

      await modal.onSubmit({ value: { username: 'someone', name: 'Someone Else' } })

      expect(api.lastCall('patch', '/users/2')?.body).toEqual({ username: 'someone', name: 'Someone Else' })
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('stays open and says so when the save fails', async () => {
      const modal = open()
      api.fail('patch', '/users/2', { error: { message: 'Username already taken' } })

      await modal.onSubmit({ value: { username: 'taken' } })

      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalledWith('Username already taken', 'toast.title_error')
    })

    it('signs you out when you rename yourself', async () => {
      // ⚠️ The token names the old username, so every request after this would fail
      const modal = open({
        user: { id: 1, username: 'admin', name: 'Admin', admin: true },
        signedInAs: 'admin',
      })

      await modal.onSubmit({ value: { username: 'administrator' } })

      expect(auth.logout).toHaveBeenCalled()
    })

    it('leaves you signed in when you only change your own name', async () => {
      const modal = open({
        user: { id: 1, username: 'admin', name: 'Admin', admin: true },
        signedInAs: 'admin',
      })

      await modal.onSubmit({ value: { username: 'admin', name: 'The Admin' } })

      expect(auth.logout).not.toHaveBeenCalled()
    })

    it('leaves you signed in when you rename somebody else', async () => {
      const modal = open({ signedInAs: 'admin' })

      await modal.onSubmit({ value: { username: 'renamed' } })

      expect(auth.logout).not.toHaveBeenCalled()
    })

    it('deletes the user in delete mode', async () => {
      const modal = open()
      modal.toggleDeleteMode({ target: document.createElement('button') } as unknown as MouseEvent)

      await modal.onSubmit({ value: {} })

      expect(api.lastCall('delete', '/users/2')).toBeDefined()
      expect(api.callsTo('patch')).toEqual([])
      expect(activeModal.close).toHaveBeenCalled()
    })

    it('says so when the delete fails', async () => {
      const modal = open()
      api.fail('delete', '/users/2', new Error('server unavailable'))
      modal.toggleDeleteMode({ target: document.createElement('button') } as unknown as MouseEvent)

      await modal.onSubmit({ value: {} })

      expect(activeModal.close).not.toHaveBeenCalled()
      expect(toastr.error).toHaveBeenCalled()
    })

    it('locks the form while delete is armed', () => {
      // Nothing on it can be saved from that state, so an editable form would be
      // misleading
      const modal = open()

      modal.toggleDeleteMode({ target: document.createElement('button') } as unknown as MouseEvent)

      expect(modal.form.disabled).toBe(true)
    })

    it('unlocks it again when delete is disarmed', () => {
      const modal = open()
      const event = { target: document.createElement('button') } as unknown as MouseEvent

      modal.toggleDeleteMode(event)
      modal.toggleDeleteMode(event)

      expect(modal.form.disabled).toBe(false)
    })

    it('takes the focus off the button it was pressed on', () => {
      // Otherwise the outline sits on a button whose meaning has just changed
      const modal = open()
      const target = document.createElement('button')
      const blur = vi.spyOn(target, 'blur')

      modal.toggleDeleteMode({ target } as unknown as MouseEvent)

      expect(blur).toHaveBeenCalled()
    })

    describe('the last administrator', () => {
      const onlyAdmin = { id: 1, username: 'admin', name: 'Admin', admin: true }

      it('cannot be demoted', () => {
        const modal = open({ user: onlyAdmin, existingUsers: [onlyAdmin], signedInAs: 'someone' })

        expect(modal.isLastAdmin()).toBe(true)
        expect(modal.form.controls.admin.disabled).toBe(true)
      })

      it('cannot be deleted', () => {
        const modal = open({ user: onlyAdmin, existingUsers: [onlyAdmin], signedInAs: 'someone' })

        expect(modal.canDelete()).toBe(false)
      })

      it('stays undemotable after delete mode is turned off again', () => {
        // ⚠️ `form.enable()` re-enables every control, including the one that was
        // deliberately disabled
        const modal = open({ user: onlyAdmin, existingUsers: [onlyAdmin], signedInAs: 'someone' })
        const event = { target: document.createElement('button') } as unknown as MouseEvent

        modal.toggleDeleteMode(event)
        modal.toggleDeleteMode(event)

        expect(modal.form.controls.admin.disabled).toBe(true)
      })

      it('can be demoted while another admin exists', () => {
        const other = { id: 2, username: 'second', name: 'Second', admin: true }
        const modal = open({ user: onlyAdmin, existingUsers: [onlyAdmin, other], signedInAs: 'someone' })

        expect(modal.isLastAdmin()).toBe(false)
        expect(modal.form.controls.admin.disabled).toBe(false)
      })

      it('is not treated as the last admin when the user is not an admin', () => {
        const modal = open({ user: { id: 2, username: 'someone', admin: false }, existingUsers: [] })

        expect(modal.isLastAdmin()).toBe(false)
      })
    })

    describe('who cannot delete whom', () => {
      it('you cannot delete yourself', () => {
        // You would be signing yourself out of a box you may be the only admin of
        const modal = open({
          user: { id: 1, username: 'admin', name: 'Admin', admin: true },
          existingUsers: [
            { id: 1, username: 'admin', admin: true },
            { id: 2, username: 'second', admin: true },
          ],
          signedInAs: 'admin',
        })

        expect(modal.isCurrentUser()).toBe(true)
        expect(modal.canDelete()).toBe(false)
      })

      it('you can delete somebody else', () => {
        const modal = open({ signedInAs: 'admin' })

        expect(modal.canDelete()).toBe(true)
      })
    })

    describe('a duplicate username', () => {
      it('is refused', () => {
        const modal = open()

        modal.form.controls.username.setValue('admin')

        expect(modal.form.controls.username.hasError('duplicateUsername')).toBe(true)
      })

      it('does not count the user own name against them', () => {
        const modal = open()

        modal.form.controls.username.setValue('someone')

        expect(modal.form.controls.username.hasError('duplicateUsername')).toBe(false)
      })
    })

    it('closes without saving when dismissed', () => {
      const modal = open()

      modal.dismissModal()

      expect(activeModal.dismiss).toHaveBeenCalled()
      expect(api.calls).toEqual([])
    })
  })
})
