import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'

import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { describeScope, EMPTY_KIOSK_SCOPE, KioskScope } from '@/app/modules/kiosk/kiosk-scope'
import { ScopePickerComponent } from '@/app/modules/kiosk/scope-picker/scope-picker.component'

/** Add a tablet, or change one's name, scope, label or sensitive setting. The accessories in the scope are sent with it. */
@Component({
  selector: 'app-tablet-edit',
  imports: [
    ReactiveFormsModule,
    RequiredIndicatorComponent,
    ScopePickerComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './tablet-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabletEditComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $accessories = inject(AccessoriesService)
  private $destroyRef = inject(DestroyRef)
  private $devices = inject(KioskDevicesService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /** Set by the opener to edit this tablet. Left unset to add one. */
  public device?: KioskDevice
  /** Set by the opener: the scope a new tablet starts with, e.g. the accessories page filter */
  public preselectScope?: KioskScope

  protected readonly loading = signal(true)
  protected readonly saving = signal(false)
  protected readonly rooms = signal<string[]>([])
  protected readonly labels = signal<string[]>([])
  /** The scope being picked */
  protected readonly scope = signal<KioskScope>({ ...EMPTY_KIOSK_SCOPE })
  /** How many accessories the scope resolves to right now, or null while unknown */
  protected readonly count = signal<number | null>(null)
  /** Once the user types a label, the scope no longer rewrites it */
  private labelEdited = false

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(64),
      ],
    }),
    scopeLabel: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.maxLength(128),
      ],
    }),
    allowSensitive: new FormControl(false, { nonNullable: true }),
  })

  protected readonly nameControl = this.form.controls.name
  protected readonly scopeLabelControl = this.form.controls.scopeLabel
  protected readonly allowControl = this.form.controls.allowSensitive

  public ngOnInit(): void {
    this.$destroyRef.onDestroy(() => this.$devices.releaseSession())
    void this.load()
  }

  private async load(): Promise<void> {
    this.form.patchValue({
      name: this.device?.name ?? '',
      allowSensitive: this.device?.allowSensitive ?? false,
    })

    try {
      await this.$devices.ensureSession()
    } catch (error) {
      console.error(error)
    }

    const start = this.device?.scope ?? this.preselectScope ?? EMPTY_KIOSK_SCOPE
    this.scope.set(normaliseScope(start))
    this.rooms.set(this.$accessories.rooms().map(room => room.name))
    this.labels.set([
      ...new Set(Object.values(this.$accessories.labels()).flat()),
    ]
      .sort((a, b) => a.localeCompare(b)))

    if (this.device?.scopeLabel) {
      this.labelEdited = true
      this.scopeLabelControl.setValue(this.device.scopeLabel)
    } else {
      this.refreshLabel()
    }
    this.updateCount()
    this.loading.set(false)
  }

  protected onScopeChange(scope: KioskScope): void {
    this.setScope(scope)
  }

  protected onLabelInput(value: string): void {
    this.labelEdited = true
    this.scopeLabelControl.setValue(value)
  }

  private setScope(scope: KioskScope): void {
    this.scope.set(scope)
    this.refreshLabel()
    this.updateCount()
  }

  /** The scope's generated name, unless the user has typed their own */
  private refreshLabel(): void {
    if (!this.labelEdited) {
      this.scopeLabelControl.setValue(this.generatedLabel())
    }
  }

  private generatedLabel(): string {
    return describeScope(this.scope(), key => this.$translate.instant(key))
  }

  private updateCount(): void {
    this.count.set(this.$devices.resolveAllowed(this.scope()).length)
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched()
      return
    }

    this.saving.set(true)
    try {
      const scope = this.scope()
      const input = {
        name: this.nameControl.value.trim(),
        scope,
        scopeLabel: this.scopeLabelControl.value.trim() || this.generatedLabel(),
        allowSensitive: this.allowControl.value,
        allowedUniqueIds: this.$devices.resolveAllowed(scope),
      }
      const saved = this.device
        ? await this.$devices.update(this.device.id, input)
        : await this.$devices.create(input)
      this.$toastr.success(this.$translate.instant('kiosk.tablets.saved'), this.$translate.instant('toast.title_success'))
      this.$activeModal.close(saved)
    } catch (error) {
      this.$toastr.error(this.$errors.toToastMessage(error), this.$translate.instant('toast.title_error'))
    } finally {
      this.saving.set(false)
    }
  }

  protected dismiss(): void {
    this.$activeModal.dismiss()
  }
}

/** A scope with every list present, copied so the picker never edits the stored one */
function normaliseScope(scope: KioskScope): KioskScope {
  return {
    rooms: [
      ...(scope.rooms ?? []),
    ],
    categories: [
      ...(scope.categories ?? []),
    ],
    subcategories: [
      ...(scope.subcategories ?? []),
    ],
    labels: [
      ...(scope.labels ?? []),
    ],
  }
}
