import type { DirectConnectionStatus } from '@/app/modules/settings/direct-connection-modal/direct-connection-modal.component'
import type { FakeApi } from '@/testing'

import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DirectConnectionModalComponent } from '@/app/modules/settings/direct-connection-modal/direct-connection-modal.component'
import { activeModalStub, fakeApi, toastrStub } from '@/testing'
import { provideFakes, provideTestTranslate } from '@/testing/providers'

const ENDPOINT = '/settings/direct-connection'

function makeStatus(overrides: Partial<DirectConnectionStatus> = {}): DirectConnectionStatus {
  return {
    supported: true,
    blockedReason: null,
    enabled: false,
    variant: 'named',
    hostname: '',
    tunnelId: null,
    loggedIn: false,
    loginInProgress: false,
    loginUrl: null,
    state: 'stopped',
    publicUrl: null,
    lastError: null,
    ...overrides,
  }
}

/**
 * The modal that publishes the UI through a Cloudflare Tunnel. What matters
 * most is that it never offers to connect when the server would refuse (no
 * login, invalid hostname, auth disabled), and that it locks the form while a
 * tunnel is running so the hostname on screen is the one being served.
 */
describe('directConnectionModalComponent', () => {
  let api: FakeApi
  let toastr: ReturnType<typeof toastrStub>

  async function open(status: DirectConnectionStatus) {
    TestBed.resetTestingModule()
    api = fakeApi().respond('get', ENDPOINT, status)
    toastr = toastrStub()

    TestBed.configureTestingModule({
      providers: [
        provideTestTranslate(),
        provideFakes({
          api,
          toastr,
          activeModal: activeModalStub(),
        }),
      ],
    })

    const fixture = TestBed.createComponent(DirectConnectionModalComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return { fixture, modal: fixture.componentInstance }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
    vi.restoreAllMocks()
  })

  it('loads the saved settings into the form', async () => {
    const { modal } = await open(makeStatus({ variant: 'named', hostname: 'homebridge.example.com', loggedIn: true }))

    expect(modal.variantControl.value).toBe('named')
    expect(modal.hostnameControl.value).toBe('homebridge.example.com')
    expect(modal.canConnect()).toBe(true)
  })

  it('needs a Cloudflare sign-in and a valid hostname for a named tunnel', async () => {
    const { modal } = await open(makeStatus({ hostname: 'homebridge.example.com' }))
    expect(modal.canConnect()).toBe(false)

    const signedIn = await open(makeStatus({ loggedIn: true }))
    signedIn.modal.hostnameControl.setValue('not a hostname')
    expect(signedIn.modal.canConnect()).toBe(false)

    signedIn.modal.hostnameControl.setValue('homebridge.example.com')
    expect(signedIn.modal.canConnect()).toBe(true)
  })

  it('lets a quick tunnel connect without an account', async () => {
    const { modal } = await open(makeStatus())

    modal.variantControl.setValue('quick')

    expect(modal.canConnect()).toBe(true)
  })

  it('never offers to connect when the server would refuse', async () => {
    const blocked = await open(makeStatus({ variant: 'quick', blockedReason: 'auth-disabled' }))
    expect(blocked.modal.canConnect()).toBe(false)
    expect(blocked.modal.variantControl.disabled).toBe(true)

    const unsupported = await open(makeStatus({ variant: 'quick', supported: false }))
    expect(unsupported.modal.canConnect()).toBe(false)
  })

  it('locks the form while a tunnel is running', async () => {
    const { modal } = await open(makeStatus({
      enabled: true,
      state: 'connected',
      hostname: 'homebridge.example.com',
      loggedIn: true,
    }))

    expect(modal.variantControl.disabled).toBe(true)
    expect(modal.hostnameControl.disabled).toBe(true)
    expect(modal.canConnect()).toBe(false)
  })

  it('saves the settings before connecting', async () => {
    const { modal } = await open(makeStatus({ loggedIn: true }))
    api
      .respond('put', ENDPOINT, makeStatus({ loggedIn: true, hostname: 'homebridge.example.com' }))
      .respond('post', `${ENDPOINT}/connect`, makeStatus({
        loggedIn: true,
        hostname: 'homebridge.example.com',
        enabled: true,
        state: 'starting',
      }))

    modal.hostnameControl.setValue('HomeBridge.Example.com ')
    await modal.connect()

    expect(api.callsTo('put', ENDPOINT)[0].body).toEqual({ variant: 'named', hostname: 'homebridge.example.com' })
    expect(api.callsTo('post', `${ENDPOINT}/connect`)).toHaveLength(1)
    expect(modal.status()?.enabled).toBe(true)
  })

  it('shows the server error and does not connect when saving fails', async () => {
    const { modal } = await open(makeStatus({ loggedIn: true, hostname: 'homebridge.example.com' }))
    api.fail('put', ENDPOINT, {
      error: { message: 'Disconnect before changing the Direct Connection settings.' },
    })

    await modal.connect()

    expect(api.callsTo('post', `${ENDPOINT}/connect`)).toHaveLength(0)
    expect(toastr.at('error')[0].message).toBe('Disconnect before changing the Direct Connection settings.')
  })

  it('opens the Cloudflare sign-in link in a new tab', async () => {
    const { modal } = await open(makeStatus())
    const loginUrl = 'https://dash.cloudflare.com/argotunnel?aud=&callback=x'
    api.respond('post', `${ENDPOINT}/login`, makeStatus({ loginInProgress: true, loginUrl }))
    const tab = {
      opener: {},
      location: { href: '' },
      close: vi.fn(),
    }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)

    await modal.signIn()

    expect(tab.location.href).toBe(loginUrl)
    expect(tab.opener).toBeNull()
    expect(tab.close).not.toHaveBeenCalled()
  })
})
