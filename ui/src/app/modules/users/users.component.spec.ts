import type { FakeApi, FakeModalService, FakeSettings, FakeToastr } from '@/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { TranslatePipe } from '@ngx-translate/core'
import { of } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ADD_USER_MODAL_DATA, USER_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { UsersComponent } from '@/app/modules/users/users.component'
import { fakeApi, makeAuth, makeSettings, modalServiceSpy, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The users page.
 *
 * Its own logic is small — the four modals do the work — but two things about it
 * matter: the list has to come from the route resolver rather than a fetch on
 * init, and it has to **re-read the list after every change**. A silent failure
 * there leaves the page showing its pre-change snapshot, so a user who has just
 * been added appears to have vanished.
 */
describe('usersComponent', () => {
  let api: FakeApi
  let toastr: FakeToastr
  let settings: FakeSettings
  let modal: FakeModalService

  const users = [
    { id: 1, name: 'Test Admin', username: 'admin', admin: true },
    { id: 2, name: 'Second Person', username: 'second', admin: false },
  ] as any[]

  /**
   * Build the page.
   * @param options - how to set the page up
   * @param options.resolved - the user list the route resolver supplies
   * @param options.admin - whether the signed-in user is an admin
   * @param options.arrange - runs on the fresh fakes before the page is created
   */
  function create(options: { resolved?: any[], admin?: boolean, arrange?: () => void } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
    toastr = toastrStub()
    settings = makeSettings()
    modal = modalServiceSpy()

    TestBed.configureTestingModule({
      imports: [UsersComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({
          api,
          toastr,
          settings,
          modal,
          auth: makeAuth({ user: { username: 'admin', admin: options.admin ?? true } }),
        }),
        {
          provide: ActivatedRoute,
          // `'resolved' in options` rather than `??`, so a case can pass
          // `undefined` on purpose to model a resolver that returned nothing
          useValue: { data: of({ homebridgeUsers: 'resolved' in options ? options.resolved : users }) },
        },
      ],
    })

    TestBed.overrideComponent(UsersComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    options.arrange?.()

    const fixture = TestBed.createComponent(UsersComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  async function settle() {
    for (let tick = 0; tick < 12; tick += 1) {
      await Promise.resolve()
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
  })

  describe('the list', () => {
    it('takes the users from the route rather than fetching them', () => {
      // The resolver has already loaded them, so a second request on init would
      // just be a duplicate round trip
      const page = create()

      expect(page.homebridgeUsers()).toEqual(users)
      expect(api.callsTo('get')).toEqual([])
    })

    it('copes with a route that resolved nothing', () => {
      const page = create({ resolved: undefined })

      expect(page.homebridgeUsers()).toEqual([])
    })

    it('sets the page title', () => {
      create()

      expect(settings.setPageTitle).toHaveBeenCalledWith('users.title_users')
    })

    it('knows which user is signed in, and whether they are an admin', () => {
      const page = create({ admin: false })

      expect(page.username).toBe('admin')
      expect(page.isAdmin).toBe(false)
    })
  })

  describe('adding a user', () => {
    it('tells the modal who already exists, so it can reject a duplicate name', async () => {
      const page = create()

      void page.openAddNewUser()
      await settle()

      expect(modal.dataFor(ADD_USER_MODAL_DATA)?.existingUsers).toEqual(users)
      expect(modal.lastOpened()!.options?.backdrop).toBe('static')
    })

    it('re-reads the list once the user has been added', async () => {
      const page = create({ arrange: () => api.respond('get', '/users', [...users, { id: 3, username: 'third' }]) })

      void page.openAddNewUser()
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(api.callsTo('get', '/users')).toHaveLength(1)
      expect(page.homebridgeUsers()).toHaveLength(3)
    })

    it('leaves the list alone when the modal is dismissed', async () => {
      const page = create()

      void page.openAddNewUser()
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(api.callsTo('get', '/users')).toEqual([])
      expect(page.homebridgeUsers()).toEqual(users)
    })

    it('says so when the list cannot be re-read', async () => {
      // Otherwise the page silently keeps its old snapshot and the new user
      // looks as though they were never created
      const page = create({ arrange: () => api.fail('get', '/users', new Error('server unavailable')) })

      void page.openAddNewUser()
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(toastr.error).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
      expect(page.homebridgeUsers()).toEqual(users)
    })
  })

  describe('editing a user', () => {
    it('hands the modal the user and everyone else', async () => {
      const page = create()

      void page.openEditUser(users[1])
      await settle()

      const data = modal.dataFor(USER_MODAL_DATA)
      expect(data?.user).toBe(users[1])
      expect(data?.existingUsers).toEqual(users)
    })

    it('re-reads the list once the edit is saved', async () => {
      const page = create({ arrange: () => api.respond('get', '/users', users) })

      void page.openEditUser(users[1])
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(api.callsTo('get', '/users')).toHaveLength(1)
    })

    it('leaves the list alone when the edit is abandoned', async () => {
      const page = create()

      void page.openEditUser(users[1])
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(api.callsTo('get', '/users')).toEqual([])
    })
  })

  describe('two factor authentication', () => {
    it('opens the setup modal for the chosen user', async () => {
      const page = create()

      void page.setup2fa(users[1])
      await settle()

      expect(modal.dataFor(USER_MODAL_DATA)?.user).toBe(users[1])
    })

    it('re-reads the list once it has been set up', async () => {
      // The list shows whether each user has 2FA on
      const page = create({ arrange: () => api.respond('get', '/users', users) })

      void page.setup2fa(users[1])
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(api.callsTo('get', '/users')).toHaveLength(1)
    })

    it('opens the disable modal for the chosen user', async () => {
      const page = create()

      void page.disable2fa(users[1])
      await settle()

      expect(modal.dataFor(USER_MODAL_DATA)?.user).toBe(users[1])
    })

    it('re-reads the list once it has been switched off', async () => {
      const page = create({ arrange: () => api.respond('get', '/users', users) })

      void page.disable2fa(users[1])
      await settle()
      modal.lastOpened()!.ref.close()
      await settle()

      expect(api.callsTo('get', '/users')).toHaveLength(1)
    })

    it('leaves the list alone when setup is abandoned', async () => {
      const page = create()

      void page.setup2fa(users[1])
      await settle()
      modal.lastOpened()!.ref.dismiss()
      await settle()

      expect(api.callsTo('get', '/users')).toEqual([])
    })
  })

  describe('the support link', () => {
    it('opens the support modal without touching the user list', () => {
      const page = create()

      page.openSupport()

      expect(modal.opened).toHaveLength(1)
      expect(api.callsTo('get')).toEqual([])
    })
  })
})
