import type { FakeApi, FakeAuth, FakeIoNamespace, FakeSettings, FakeToastr, FakeWs } from '@/testing'
import type { ComponentFixture } from '@angular/core/testing'

import { NO_ERRORS_SCHEMA } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Title } from '@angular/platform-browser'
import { TranslatePipe } from '@ngx-translate/core'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getStoredToken, setStoredToken } from '@/app/core/auth/token-store'
import { SetupWizardComponent } from '@/app/modules/setup-wizard/setup-wizard.component'
import { environment } from '@/environments/environment'
import { fakeApi, fakeWs, makeAuth, makeSettings, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

/**
 * The setup wizard — the first thing anyone sees on a fresh install. It either
 * creates the first user, or restores a backup onto the empty box.
 *
 * ⚠️ **The restore path is authenticated.** There is no user yet, so it fetches a
 * temporary token from `/setup-wizard/get-setup-wizard-token` and then uploads the
 * archive to `POST /backup/restore`, which is behind both the auth guard and the
 * admin guard. That token therefore has to reach the place the HTTP layer reads it
 * from — `token-store`, which is what `tokenGetter` returns — or every request in
 * the flow goes out with no Authorization header and the restore 401s.
 */
describe('setupWizardComponent', () => {
  let api: FakeApi
  let auth: FakeAuth
  let settings: FakeSettings
  let toastr: FakeToastr
  let ws: FakeWs
  let io: FakeIoNamespace
  let fixture: ComponentFixture<SetupWizardComponent>

  /** The token the server hands out for the restore. */
  const SETUP_TOKEN = 'setup-wizard-token'

  /**
   * Build the wizard.
   * @param options - how to set it up
   * @param options.env - settings env overrides
   * @param options.settingsLoaded - whether the settings have already arrived
   */
  function create(options: { env?: Record<string, any>, settingsLoaded?: boolean } = {}) {
    TestBed.resetTestingModule()
    api = fakeApi()
      .respond('get', '/setup-wizard/get-setup-wizard-token', { access_token: SETUP_TOKEN })
      .respond('post', '/setup-wizard/create-first-user', {})
      .respond('post', '/backup/restore', {})
      .respond('put', '/backup/restart', {})
    auth = makeAuth()
    toastr = toastrStub()
    ws = fakeWs()
    settings = makeSettings({ env: options.env })
    settings.settingsLoaded = options.settingsLoaded ?? true

    io = ws.namespace('backup')
    io.socket.respondTo('do-restore', {})

    setStoredToken(null)
    window.localStorage.clear()

    TestBed.configureTestingModule({
      imports: [SetupWizardComponent],
      providers: [
        provideTestTranslate(),
        provideFakes({ api, auth, settings, toastr, ws }),
      ],
    })

    TestBed.overrideComponent(SetupWizardComponent, {
      set: { imports: [TranslatePipe], schemas: [NO_ERRORS_SCHEMA] },
    })

    fixture = TestBed.createComponent(SetupWizardComponent)
    fixture.detectChanges()
    return fixture.componentInstance
  }

  /**
   * Move to a step and render it, so the elements that step owns exist.
   * @param wizard - the component
   * @param step - the step to show
   */
  function showStep(wizard: SetupWizardComponent, step: any) {
    wizard.step.set(step)
    fixture.detectChanges()
  }

  async function settle() {
    for (let tick = 0; tick < 20; tick += 1) {
      await Promise.resolve()
    }
  }

  /** A file the picker would hand over. */
  function fileOfSize(bytes: number, name = 'homebridge-backup.tar.gz') {
    const file = new File(['x'], name, { type: 'application/gzip' })
    Object.defineProperty(file, 'size', { value: bytes })
    return file
  }

  /**
   * A change event from the file input.
   * @param files - what the user picked
   */
  function fileEvent(files: File[]): Event {
    const input = document.createElement('input')
    input.type = 'file'
    Object.defineProperty(input, 'files', { value: files, configurable: true, writable: true })
    return { target: input } as unknown as Event
  }

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(console.error).mockClear()
    globalThis.backup = { maxBackupSize: 10 * 1024 * 1024, maxBackupSizeText: '10MB' } as any
  })

  afterEach(() => {
    vi.useRealTimers()
    setStoredToken(null)
    window.localStorage.clear()
  })

  describe('arriving on the wizard', () => {
    it('titles the page', () => {
      create()

      expect(TestBed.inject(Title).getTitle()).toBe('setup_wizard_page_title')
    })

    it('starts on the welcome step', () => {
      const wizard = create()

      expect(wizard.step()).toBe('welcome')
      expect(wizard.progress()).toBe(1)
    })

    it('shows the wallpaper the user set', async () => {
      const wizard = create({ env: { customWallpaperHash: 'abc123' } })
      await settle()

      expect(wizard.backgroundStyle()).toBe(`url('${environment.api.base}/auth/wallpaper/abc123') center/cover`)
    })

    it('shows no wallpaper when none is set', async () => {
      const wizard = create()
      await settle()

      expect(wizard.backgroundStyle()).toBeUndefined()
    })

    it('waits for the settings before deciding on a wallpaper', async () => {
      // On a fresh install the wizard renders before /auth/settings has answered
      const loaded = new Subject<void>()
      const wizard = create({ settingsLoaded: false })
      settings.onSettingsLoaded = loaded as any
      await settle()

      expect(wizard.backgroundStyle()).toBeUndefined()
    })
  })

  describe('moving through the steps', () => {
    it('goes to the account form', () => {
      const wizard = create()

      wizard.onClickGettingStarted()

      expect(wizard.step()).toBe('create-account')
      expect(wizard.progress()).toBe(50)
    })

    it('goes to the restore form', () => {
      const wizard = create()

      wizard.onClickRestoreBackup()

      expect(wizard.step()).toBe('restore-backup')
      expect(wizard.progress()).toBe(20)
    })

    it('comes back from the restore form, forgetting the chosen file', () => {
      const wizard = create()
      wizard.onClickRestoreBackup()
      wizard.selectedFile.set(fileOfSize(1000))

      wizard.onClickCancelRestore()

      expect(wizard.step()).toBe('welcome')
      expect(wizard.progress()).toBe(1)
      expect(wizard.selectedFile()).toBeUndefined()
    })
  })

  describe('creating the first user', () => {
    /**
     * Fill the form in.
     * @param wizard - the component
     * @param values - the form values
     * @param values.username - the account name
     * @param values.password - the password
     * @param values.passwordConfirm - the confirmation, defaulting to the password
     */
    function fill(wizard: SetupWizardComponent, values: { username?: string, password?: string, passwordConfirm?: string }) {
      wizard.createUserForm.setValue({
        username: values.username ?? 'admin',
        password: values.password ?? 'password',
        passwordConfirm: values.passwordConfirm ?? 'password',
      })
    }

    it('sends the account to the server', async () => {
      const wizard = create()
      fill(wizard, { username: 'someone', password: 'a-password' })

      await wizard.createFirstUser()

      expect(api.lastCall('post', '/setup-wizard/create-first-user')?.body).toMatchObject({
        username: 'someone',
        password: 'a-password',
      })
    })

    it('uses the username as the display name', async () => {
      // The wizard has no name field; the users page can change it later
      const wizard = create()
      fill(wizard, { username: 'someone' })

      await wizard.createFirstUser()

      expect(api.lastCall('post', '/setup-wizard/create-first-user')?.body.name).toBe('someone')
    })

    it('signs the new user straight in', async () => {
      // Otherwise the wizard hands them to a login page for an account they only
      // just typed
      const wizard = create()
      fill(wizard, { username: 'someone', password: 'a-password' })

      await wizard.createFirstUser()

      expect(auth.login).toHaveBeenCalledWith({ username: 'someone', password: 'a-password' })
      expect(wizard.step()).toBe('setup-complete')
    })

    it('records that the wizard is done', async () => {
      const wizard = create()
      fill(wizard, {})

      await wizard.createFirstUser()

      expect(settings.env.setupWizardComplete).toBe(true)
      expect(wizard.progress()).toBe(100)
    })

    it('stays on the form and says what went wrong', async () => {
      const wizard = create()
      api.fail('post', '/setup-wizard/create-first-user', { error: { message: 'Username already taken' } })
      fill(wizard, {})

      await wizard.createFirstUser()

      expect(wizard.step()).toBe('welcome')
      expect(wizard.progress()).toBe(50)
      expect(wizard.loading()).toBe(false)
      expect(toastr.error).toHaveBeenCalledWith('Username already taken', 'toast.title_error')
    })

    it('does not sign anyone in when the account was not created', async () => {
      const wizard = create()
      api.fail('post', '/setup-wizard/create-first-user', new Error('disk full'))
      fill(wizard, {})

      await wizard.createFirstUser()

      expect(auth.login).not.toHaveBeenCalled()
    })
  })

  describe('the account form rules', () => {
    it('wants a username and a password', () => {
      const wizard = create()

      expect(wizard.createUserForm.controls.username.hasError('required')).toBe(true)
      expect(wizard.createUserForm.controls.password.hasError('required')).toBe(true)
    })

    it('wants a password of at least four characters', () => {
      const wizard = create()

      wizard.createUserForm.controls.password.setValue('abc')

      expect(wizard.createUserForm.controls.password.hasError('minlength')).toBe(true)
    })

    it('refuses two passwords that do not match', () => {
      const wizard = create()

      wizard.createUserForm.setValue({ username: 'admin', password: 'password', passwordConfirm: 'different' })

      expect(wizard.createUserForm.hasError('matchPassword')).toBe(true)
      expect(wizard.createUserForm.controls.passwordConfirm.hasError('matchPassword')).toBe(true)
    })

    it('accepts them once they match', () => {
      const wizard = create()
      wizard.createUserForm.setValue({ username: 'admin', password: 'password', passwordConfirm: 'different' })

      wizard.createUserForm.controls.passwordConfirm.setValue('password')

      expect(wizard.createUserForm.hasError('matchPassword')).toBe(false)
      expect(wizard.createUserForm.controls.passwordConfirm.errors).toBeNull()
    })

    it('keeps the empty-field error while the confirmation is blank', () => {
      // ⚠️ The match check writes the errors of the confirm field itself, so a
      // careless version wipes `required` and the form looks valid while empty
      const wizard = create()

      wizard.createUserForm.setValue({ username: 'admin', password: 'password', passwordConfirm: '' })

      expect(wizard.createUserForm.controls.passwordConfirm.hasError('required')).toBe(true)
      expect(wizard.createUserForm.controls.passwordConfirm.hasError('matchPassword')).toBe(true)
    })

    it('keeps the empty-field error after a mismatch is corrected away', () => {
      const wizard = create()
      wizard.createUserForm.setValue({ username: 'admin', password: '', passwordConfirm: '' })

      expect(wizard.createUserForm.controls.passwordConfirm.hasError('required')).toBe(true)
      expect(wizard.createUserForm.controls.passwordConfirm.hasError('matchPassword')).toBe(false)
    })
  })

  describe('picking a backup file', () => {
    it('takes the file the user picked', () => {
      const wizard = create()

      wizard.handleRestoreFileInput(fileEvent([fileOfSize(1000)]))

      expect(wizard.selectedFile()?.name).toBe('homebridge-backup.tar.gz')
      expect(wizard.progress()).toBe(40)
    })

    it('refuses one bigger than the server will accept', () => {
      // ⚠️ Checked here rather than after uploading: the upload of a large archive
      // takes minutes, and the server would refuse it at the end
      const wizard = create()
      const event = fileEvent([fileOfSize(50 * 1024 * 1024)])

      wizard.handleRestoreFileInput(event)

      expect(wizard.selectedFile()).toBeUndefined()
      expect(wizard.progress()).toBe(20)
      expect(toastr.error).toHaveBeenCalled()
    })

    it('clears the input after refusing one, so the same file can be re-picked', () => {
      const wizard = create()
      const event = fileEvent([fileOfSize(50 * 1024 * 1024)])

      wizard.handleRestoreFileInput(event)

      expect((event.target as HTMLInputElement).value).toBe('')
    })

    it('forgets the file when the picker is cleared', () => {
      const wizard = create()
      wizard.handleRestoreFileInput(fileEvent([fileOfSize(1000)]))

      wizard.handleRestoreFileInput(fileEvent([]))

      expect(wizard.selectedFile()).toBeUndefined()
      expect(wizard.progress()).toBe(20)
    })
  })

  describe('restoring the backup', () => {
    /**
     * Start a restore with a file already chosen.
     *
     * ⚠️ Fake timers are not optional here: after the restart the wizard waits
     * five times three seconds before it starts polling, so a test that awaits
     * the whole flow on real timers takes fifteen seconds and times out.
     * @param wizard - the component
     */
    function startRestore(wizard: SetupWizardComponent) {
      wizard.selectedFile.set(fileOfSize(1000))
      showStep(wizard, 'restoring')
      return wizard.onRestoreBackupClick()
    }

    /**
     * Run a restore all the way through, advancing past the waits.
     * @param wizard - the component
     */
    async function runRestore(wizard: SetupWizardComponent) {
      const pending = startRestore(wizard)
      await vi.advanceTimersByTimeAsync(20000)
      await pending
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    /**
     * What the token situation was at the moment a request was made.
     *
     * ⚠️ Measured inside the responder, not after the flow. The wizard hands the
     * token back as part of the same run, and all of that happens in microtasks —
     * so anything checked after `await` sees `null` whether the token was ever set
     * or not. That made an earlier version of this test pass against the bug.
     * @param method - the http verb to watch
     * @param url - the url to watch
     */
    function tokenDuring(method: 'get' | 'post' | 'put', url: string) {
      const seen: { stored: string | null, inLocalStorage: string | null } = { stored: null, inLocalStorage: null }
      api.respond(method, url, () => {
        seen.stored = getStoredToken()
        seen.inLocalStorage = window.localStorage.getItem(environment.jwt.tokenKey)
        return {}
      })
      return seen
    }

    it('has the token in place when it uploads the archive', async () => {
      // ⚠️ The load-bearing one. `POST /backup/restore` is behind the auth and
      // admin guards, and the Authorization header comes from the token store via
      // `tokenGetter` — a token written anywhere else means no header at all, and
      // the upload 401s
      const wizard = create()
      const seen = tokenDuring('post', '/backup/restore')

      await runRestore(wizard)

      expect(seen.stored).toBe(SETUP_TOKEN)
    })

    it('still has it when it asks for the restart', async () => {
      const wizard = create()
      const seen = tokenDuring('put', '/backup/restart')

      await runRestore(wizard)

      expect(seen.stored).toBe(SETUP_TOKEN)
    })

    it('never puts the token in local storage', async () => {
      // Where it used to live, and the reason it moved: any script on the page
      // could read an admin bearer token there
      const wizard = create()
      const seen = tokenDuring('post', '/backup/restore')

      await runRestore(wizard)

      expect(seen.inLocalStorage).toBeNull()
      expect(window.localStorage.getItem(environment.jwt.tokenKey)).toBeNull()
    })

    it('uploads the archive under the name the server expects', async () => {
      const wizard = create()

      await runRestore(wizard)

      const body = api.lastCall('post', '/backup/restore')?.body as FormData
      expect(body).toBeInstanceOf(FormData)
      expect((body.get('restoreArchive') as File).name).toBe('homebridge-backup.tar.gz')
    })

    it('asks the server to run the restore', async () => {
      const wizard = create()

      await runRestore(wizard)

      expect(io.requests.map(r => r.resource)).toContain('do-restore')
    })

    it('restarts homebridge once the restore is done', async () => {
      const wizard = create()

      await runRestore(wizard)

      expect(api.callsTo('put', '/backup/restart')).toHaveLength(1)
    })

    it('says homebridge is starting while it waits', async () => {
      // Read before the waits: by the end it has moved on to restore-complete
      const wizard = create()

      const pending = startRestore(wizard)
      await settle()

      expect(wizard.step()).toBe('restarting')

      await vi.advanceTimersByTimeAsync(20000)
      await pending
    })

    it('gives the token back at the end', async () => {
      // It is an admin token on a box that now has the restored user database
      const wizard = create()

      await runRestore(wizard)

      expect(getStoredToken()).toBeNull()
      expect(auth.token).toBeNull()
    })

    it('closes the socket when it is finished with it', async () => {
      const wizard = create()

      await runRestore(wizard)

      expect(io.end).toHaveBeenCalled()
    })

    it('waits for homebridge to answer before saying it is done', async () => {
      const wizard = create()
      api.fail('get', '/auth/settings', new Error('not up yet'))

      const pending = startRestore(wizard)
      await vi.advanceTimersByTimeAsync(20000)

      expect(wizard.step()).toBe('restarting')

      api.respond('get', '/auth/settings', {})
      await vi.advanceTimersByTimeAsync(2000)

      expect(wizard.step()).toBe('restore-complete')
      expect(wizard.progress()).toBe(100)
      expect(wizard.restoreUploading()).toBe(false)
      await pending
    })

    it('stops asking once homebridge is up', async () => {
      const wizard = create()
      api.respond('get', '/auth/settings', {})

      const pending = startRestore(wizard)
      await vi.advanceTimersByTimeAsync(16000)
      const asked = api.callsTo('get', '/auth/settings').length
      await vi.advanceTimersByTimeAsync(5000)

      expect(api.callsTo('get', '/auth/settings')).toHaveLength(asked)
      await pending
    })

    it('goes back to the file picker when the upload fails', async () => {
      const wizard = create()
      api.fail('post', '/backup/restore', { error: { message: 'Archive is not a valid backup' } })

      await runRestore(wizard)

      expect(wizard.step()).toBe('restore-backup')
      expect(wizard.restoreFailed()).toBe(true)
      expect(wizard.restoreUploading()).toBe(false)
      expect(wizard.progress()).toBe(20)
      expect(toastr.error).toHaveBeenCalledWith('Archive is not a valid backup', 'toast.title_error')
    })

    it('does not restart homebridge when the restore itself failed', async () => {
      const wizard = create()
      api.fail('post', '/backup/restore', new Error('upload failed'))

      await runRestore(wizard)

      expect(api.callsTo('put', '/backup/restart')).toEqual([])
    })

    it('says so when the token cannot be fetched', async () => {
      const wizard = create()
      api.fail('get', '/setup-wizard/get-setup-wizard-token', new Error('server unavailable'))

      await runRestore(wizard)

      expect(wizard.step()).toBe('restore-backup')
      expect(api.callsTo('post', '/backup/restore')).toEqual([])
    })
  })

  describe('the restore log', () => {
    /**
     * Run a restore and push a line of server output through it.
     * @param wizard - the component
     * @param lines - the stdout payload
     */
    async function output(wizard: SetupWizardComponent, lines: string) {
      wizard.selectedFile.set(fileOfSize(1000))
      showStep(wizard, 'restoring')
      const pending = wizard.onRestoreBackupClick()
      await settle()
      // ⚠️ Only the lines this call adds. By the time the microtasks have settled
      // the wizard has already appended its own "Starting Homebridge" line, so
      // reading the whole box picks that up as well
      const box = document.getElementById('output')!
      const before = box.children.length
      io.socket.fire('stdout', lines)
      const rendered = [...box.children].slice(before).map(child => ({ text: child.textContent, classes: child.className }))
      await vi.advanceTimersByTimeAsync(20000)
      await pending
      return rendered
    }

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('shows what the server printed', async () => {
      const wizard = create()

      const rendered = await output(wizard, 'Extracting archive\n')

      expect(rendered.map(line => line.text)).toEqual(['Extracting archive'])
    })

    it('strips the colour codes out of the text', async () => {
      // They would otherwise be printed literally
      const wizard = create()

      const rendered = await output(wizard, '[0;32mRestore complete[0m\n')

      expect(rendered[0].text).toBe('Restore complete')
    })

    it.each([
      ['an error', '[0;31m', 'red-text'],
      ['a success', '[0;32m', 'green-text'],
      ['a warning', '[0;33m', 'orange-text'],
      ['a note', '[0;36m', 'cyan-text'],
    ])('colours %s line', async (_label, code, expected) => {
      const wizard = create()

      const rendered = await output(wizard, `${code}Something happened[0m\n`)

      expect(rendered[0].classes).toContain(expected)
    })

    it('ignores blank lines', async () => {
      const wizard = create()

      const rendered = await output(wizard, 'One line\n\n\n')

      expect(rendered).toHaveLength(1)
    })

    it('shows several lines in one payload', async () => {
      const wizard = create()

      const rendered = await output(wizard, 'First\nSecond\n')

      expect(rendered.map(line => line.text)).toEqual(['First', 'Second'])
    })
  })
})
