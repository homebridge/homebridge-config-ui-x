import type { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import type { AccessoryGroup } from '@/app/core/accessories/filters/accessory-filters'

import type { KioskScope } from './kiosk-scope'
import type { KioskSettings, KioskTheme } from './kiosk-settings'

import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, createEnvironmentInjector, DestroyRef, EnvironmentInjector, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { buildBatteryIndex } from '@/app/core/accessories/filters/accessory-battery'
import { DEFAULT_FILTER_STATE, groupAndSort } from '@/app/core/accessories/filters/accessory-filters'
import { isMatterService, isServiceNotResponding } from '@/app/core/accessories/filters/service-helpers'
import { AuthHelperService } from '@/app/core/auth/auth-helper.service'
import { AuthService } from '@/app/core/auth/auth.service'
import { WsService } from '@/app/core/communication/ws.service'
import { ConfirmComponent } from '@/app/core/components/confirm/confirm.component'
import { CONFIRM_MODAL_DATA } from '@/app/core/modal-data-tokens'
import { SettingsService } from '@/app/core/ui/settings.service'

import { isSensitiveService, kioskIconClass, kioskIsOn, kioskStateKey, kioskToggle } from './kiosk-controls'
import { clearStoredDevice, KioskDeviceService, loadStoredDevice } from './kiosk-device.service'
import { describeScope, EMPTY_KIOSK_SCOPE, scopeFilterState, scopeFromQuery, scopeKey, scopeToQuery } from './kiosk-scope'
import { isValidKioskPin, loadKioskSettings, saveKioskSettings } from './kiosk-settings'

/** How long the top bar must be held to open the settings panel */
const LONG_PRESS_MS = 1500

/** Settings key for a paired tablet, which has no scope in the link */
const DEVICE_SETTINGS_ID = 'device'

/** How long a paired tablet waits before trying to load again after a network failure */
const DEVICE_RETRY_MS = 15_000

type Panel = 'closed' | 'pin' | 'settings'

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The accessories of one scope on a wall or room tablet: full screen, no navigation, dark by default.
 * Each scope keeps its own settings in this browser (see kiosk-settings.ts).
 */
@Component({
  selector: 'app-kiosk',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './kiosk.component.html',
  styleUrl: './kiosk.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KioskComponent implements OnInit, OnDestroy {
  private $route = inject(ActivatedRoute)
  private $router = inject(Router)
  private $accessories = inject(AccessoriesService)
  private $ws = inject(WsService)
  private $auth = inject(AuthService)
  private $authHelper = inject(AuthHelperService)
  private $settingsService = inject(SettingsService)
  private $modal = inject(NgbModal)
  private $injector = inject(EnvironmentInjector)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private $destroyRef = inject(DestroyRef)

  private readonly $kioskDevice = inject(KioskDeviceService)

  /** Device mode: a paired tablet at kiosk/device, with no signed-in session */
  protected readonly device = this.$route.snapshot.data?.kioskDevice === true

  /** The scope named by the link's query params. A paired tablet takes its scope from the server instead. */
  protected readonly scope: KioskScope = this.device
    ? { ...EMPTY_KIOSK_SCOPE }
    : scopeFromQuery(this.$route.snapshot.queryParams)

  /** The key this scope's settings are kept under in this browser */
  protected readonly settingsKey = this.device
    ? DEVICE_SETTINGS_ID
    : scopeKey(this.scope)

  protected readonly loading = signal(true)
  protected readonly connected = signal(false)
  protected readonly reconnecting = signal(false)
  protected readonly now = signal(new Date())
  protected readonly settings = signal<KioskSettings>(loadKioskSettings(this.settingsKey))

  protected readonly panel = signal<Panel>('closed')
  protected readonly pinEntry = signal('')
  protected readonly pinWrong = signal(false)
  protected readonly newPin = signal('')
  protected readonly newPinInvalid = signal(false)

  protected readonly unpaired = this.$kioskDevice.unpaired
  protected readonly deviceScopeLabel = computed(() => this.$kioskDevice.session()?.device.scopeLabel ?? '')
  protected readonly isConnected = computed(() => this.device
    ? this.$kioskDevice.connected()
    : this.connected())

  protected readonly isReconnecting = computed(() => this.device
    ? !this.unpaired() && !this.loading() && !this.$kioskDevice.connected()
    : this.reconnecting())

  /** Whether sensitive accessories can be changed here: the session's setting on a paired tablet, else this browser's */
  protected readonly allowSensitive = computed(() => this.device
    ? this.$kioskDevice.session()?.device.allowSensitive === true
    : this.settings().allowSensitive)

  /** The title: the tablet's scope label on a paired tablet, else the scope's generated name */
  protected readonly title = computed(() => this.device
    ? (this.deviceScopeLabel() || this.$translate.instant('kiosk.title'))
    : describeScope(this.scope, key => this.$translate.instant(key)))

  protected readonly clock = computed(() => `${twoDigits(this.now().getHours())}:${twoDigits(this.now().getMinutes())}`)

  protected readonly batteryIndex = computed(() => buildBatteryIndex(this.$accessories.rooms().flatMap(room => room.services)))

  /** The scope's services, filtered, grouped and sorted as the accessories page would show them */
  protected readonly groups = computed<AccessoryGroup[]>(() => {
    if (this.device) {
      return this.$kioskDevice.groups()
    }
    const state = {
      ...DEFAULT_FILTER_STATE,
      ...scopeFilterState(this.scope),
    }
    return groupAndSort(this.$accessories.rooms(), state, this.batteryIndex(), this.$accessories.filterContext())
      .filter(group => group.services.length > 0)
  })

  private previousLightingMode!: 'auto' | 'light' | 'dark'
  private wakeLock: WakeLockSentinelLike | null = null
  private clockTimer: ReturnType<typeof setTimeout> | undefined
  private pressTimer: ReturnType<typeof setTimeout> | undefined
  private redirecting = false
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      this.now.set(new Date())
      void this.acquireWakeLock()
    }
  }

  public ngOnInit(): void {
    this.previousLightingMode = this.$settingsService.lightingMode
    this.applyTheme(this.settings().theme)

    document.addEventListener('visibilitychange', this.onVisibilityChange)
    void this.acquireWakeLock()
    this.scheduleClock()
    void this.load()
  }

  public ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    clearTimeout(this.clockTimer)
    clearTimeout(this.pressTimer)
    void this.releaseWakeLock()

    clearTimeout(this.retryTimer)
    if (this.device) {
      this.$kioskDevice.disconnect()
    } else {
      this.$accessories.stop()
    }
    this.$settingsService.setLightingMode(this.previousLightingMode, 'user')
  }

  /** Start the accessories session. The socket is created synchronously, so it can be watched straight away. */
  private async load(): Promise<void> {
    if (this.device) {
      return this.loadDevice()
    }
    const started = this.$accessories.start()
    this.watchSocket()
    try {
      await started
    } catch (error) {
      console.error(error)
    } finally {
      this.loading.set(false)
    }
  }

  /** Device mode: the stored token opens the session and the device socket. A refused token shows the unpaired state. */
  private async loadDevice(): Promise<void> {
    const stored = loadStoredDevice()
    if (!stored) {
      void this.$router.navigateByUrl('/kiosk/pair')
      return
    }
    try {
      await this.$kioskDevice.connect(stored.token)
      this.loading.set(false)
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.$kioskDevice.markUnpaired()
        return
      }
      // Offline, or the server is down (a tablet can boot before the network is up): try again shortly
      console.error(error)
      clearTimeout(this.retryTimer)
      this.retryTimer = setTimeout(() => void this.loadDevice(), DEVICE_RETRY_MS)
    }
  }

  /**
   * Track the connection for the dot and the banner. The accessories service already asks for
   * the accessories again on every (re)connect, so the data refresh needs nothing more here.
   */
  private watchSocket(): void {
    const socket = this.$ws.getExistingNamespace('accessories')?.socket
    if (!socket) {
      return
    }
    this.connected.set(socket.connected)

    const onConnect = (): void => {
      this.connected.set(true)
      this.reconnecting.set(false)
    }
    const onLost = (): void => {
      this.connected.set(false)
      this.reconnecting.set(true)
      void this.checkSession()
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onLost)
    socket.on('connect_error', onLost)
    this.$destroyRef.onDestroy(() => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onLost)
      socket.off('connect_error', onLost)
    })
  }

  /** When the session has expired, go to login and come back to this kiosk afterwards */
  private async checkSession(): Promise<void> {
    if (this.redirecting) {
      return
    }
    try {
      await this.$auth.checkAndRefreshIfNeeded()
    } catch {
      // Offline or the refresh failed: the token check below decides
    }
    if (await this.$authHelper.isAuthenticated()) {
      return
    }
    this.redirecting = true
    try {
      const target = this.$router.createUrlTree(['/kiosk'], {
        queryParams: scopeToQuery(this.scope),
      })
      window.sessionStorage.setItem('target_route', this.$router.serializeUrl(target))
    } catch {
      // Without storage the user lands on the default page after login
    }
    void this.$router.navigateByUrl('/login')
  }

  private async acquireWakeLock(): Promise<void> {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    if (!wakeLock || document.visibilityState !== 'visible' || this.wakeLock?.released === false) {
      return
    }
    try {
      this.wakeLock = await wakeLock.request('screen')
    } catch {
      // Denied or not allowed right now: the screen may sleep, and the next visibility change tries again
      this.wakeLock = null
    }
  }

  private async releaseWakeLock(): Promise<void> {
    const held = this.wakeLock
    this.wakeLock = null
    try {
      await held?.release()
    } catch {
      // Already released by the browser
    }
  }

  /** Tick at each minute boundary so the clock never lags by more than a moment */
  private scheduleClock(): void {
    const delay = 60_000 - (Date.now() % 60_000)
    this.clockTimer = setTimeout(() => {
      this.now.set(new Date())
      this.scheduleClock()
    }, delay)
  }

  private applyTheme(theme: KioskTheme): void {
    this.$settingsService.setLightingMode(theme, 'user')
  }

  protected isReady(service: ServiceTypeX): boolean {
    if (this.device) {
      return this.$kioskDevice.isReady(service)
    }
    return isMatterService(service)
      ? this.$accessories.matterReadyForControl
      : this.$accessories.hapReadyForControl
  }

  protected nameOf(service: ServiceTypeX): string {
    return service.customName || service.serviceName || ''
  }

  protected isSensitive(service: ServiceTypeX): boolean {
    return isSensitiveService(service)
  }

  /** Sensitive and not allowed on this tablet: shown, but cannot be changed or opened */
  protected isLocked(service: ServiceTypeX): boolean {
    return isSensitiveService(service) && !this.allowSensitive()
  }

  protected hasToggle(service: ServiceTypeX): boolean {
    return kioskToggle(service) !== null
  }

  protected isOn(service: ServiceTypeX): boolean {
    return kioskIsOn(service)
  }

  protected stateKey(service: ServiceTypeX): string {
    return kioskStateKey(service)
  }

  protected iconClass(service: ServiceTypeX): string {
    return kioskIconClass(service)
  }

  protected notResponding(service: ServiceTypeX): boolean {
    return isServiceNotResponding(service)
  }

  /** The icon toggles where there is a primary on/off, and otherwise opens the details */
  protected async onIconTap(service: ServiceTypeX): Promise<void> {
    if (this.isLocked(service)) {
      return
    }
    const toggle = kioskToggle(service)
    if (!toggle || !this.isReady(service)) {
      this.openDetails(service)
      return
    }
    if (isSensitiveService(service) && !(await this.confirmSensitiveChange(service))) {
      return
    }
    try {
      await toggle()
    } catch (error) {
      console.error(error)
      this.$toastr.error(this.$translate.instant('toast.api_error_generic'), this.$translate.instant('toast.title_error'))
    }
  }

  /** The body opens the details and controls modal */
  protected openDetails(service: ServiceTypeX): void {
    // Details need the signed-in session, which a paired tablet does not have
    if (this.device || this.isLocked(service)) {
      return
    }
    void this.$accessories.showAccessoryInformation(service)
  }

  /** Ask before each change to a sensitive device. Resolves true only on an explicit confirm. */
  private async confirmSensitiveChange(service: ServiceTypeX): Promise<boolean> {
    const name = this.nameOf(service)
    const injector = createEnvironmentInjector([
      {
        provide: CONFIRM_MODAL_DATA,
        useValue: {
          title: this.$translate.instant('kiosk.confirm.title', { name }),
          message: this.$translate.instant('kiosk.confirm.message'),
          confirmButtonLabel: this.$translate.instant('kiosk.confirm.button'),
          confirmButtonClass: 'btn-primary',
          faIconClass: 'fas fa-lock primary-text',
        },
      },
    ], this.$injector)

    const ref = this.$modal.open(ConfirmComponent, {
      backdrop: 'static',
      injector,
    })
    try {
      await ref.result
      return true
    } catch {
      return false
    }
  }

  /** Long press on the top bar opens the panel, through the PIN if one is set */
  protected pressStart(): void {
    this.pressCancel()
    this.pressTimer = setTimeout(() => {
      this.pressTimer = undefined
      this.openPanel()
    }, LONG_PRESS_MS)
  }

  protected pressCancel(): void {
    clearTimeout(this.pressTimer)
    this.pressTimer = undefined
  }

  protected openPanel(): void {
    this.pinEntry.set('')
    this.pinWrong.set(false)
    this.panel.set(this.settings().pin
      ? 'pin'
      : 'settings')
  }

  protected closePanel(): void {
    this.panel.set('closed')
    this.pinEntry.set('')
    this.newPin.set('')
    this.newPinInvalid.set(false)
  }

  protected onPinEntryInput(event: Event): void {
    this.pinEntry.set((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8))
  }

  protected unlock(): void {
    if (this.pinEntry() === this.settings().pin) {
      this.pinEntry.set('')
      this.pinWrong.set(false)
      this.panel.set('settings')
      return
    }
    this.pinWrong.set(true)
    this.pinEntry.set('')
  }

  protected exit(): void {
    this.closePanel()
    void this.$router.navigateByUrl(this.device ? '/kiosk/pair' : '/accessories')
  }

  /** The tablet was unpaired: forget it here and pair again */
  protected pairAgain(): void {
    clearStoredDevice()
    this.$kioskDevice.unpaired.set(false)
    void this.$router.navigateByUrl('/kiosk/pair')
  }

  protected setTheme(theme: KioskTheme): void {
    this.update({ theme })
    this.applyTheme(theme)
  }

  protected setAllowSensitive(event: Event): void {
    this.update({ allowSensitive: (event.target as HTMLInputElement).checked })
  }

  protected onNewPinInput(event: Event): void {
    this.newPin.set((event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8))
    this.newPinInvalid.set(false)
  }

  protected savePin(): void {
    const pin = this.newPin()
    if (!isValidKioskPin(pin)) {
      this.newPinInvalid.set(true)
      return
    }
    this.update({ pin })
    this.newPin.set('')
  }

  protected removePin(): void {
    this.update({ pin: undefined })
  }

  /** Keep the settings in memory, and in storage when it is available */
  private update(patch: Partial<KioskSettings>): void {
    const next: KioskSettings = {
      ...this.settings(),
      ...patch,
    }
    this.settings.set(next)
    saveKioskSettings(this.settingsKey, next)
  }
}
