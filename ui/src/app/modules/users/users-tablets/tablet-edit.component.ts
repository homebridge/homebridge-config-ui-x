import type { KioskDevice } from '@/app/modules/kiosk/kiosk-devices.service'

import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { BUILT_IN_VIEWS } from '@/app/core/accessories/filters/accessory-views'
import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { HttpErrorService } from '@/app/core/utilities/http-error.service'
import { KioskDevicesService } from '@/app/modules/kiosk/kiosk-devices.service'
import { findKioskView } from '@/app/modules/kiosk/kiosk-resolve'

interface ViewOption {
  id: string
  label: string
}

/** Add a tablet, or change one's name, view or sensitive setting. The chosen view's accessories are sent with it. */
@Component({
  selector: 'app-tablet-edit',
  imports: [
    ReactiveFormsModule,
    RequiredIndicatorComponent,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './tablet-edit.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabletEditComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $destroyRef = inject(DestroyRef)
  private $devices = inject(KioskDevicesService)
  private $errors = inject(HttpErrorService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  /** Set by the opener to edit this tablet. Left unset to add one. */
  public device?: KioskDevice
  /** Set by the opener: the view a new tablet starts on */
  public preselectViewId?: string

  protected readonly loading = signal(true)
  protected readonly saving = signal(false)
  protected readonly options = signal<ViewOption[]>([])
  /** How many accessories the chosen view resolves to right now, or null while unknown */
  protected readonly count = signal<number | null>(null)

  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(64),
      ],
    }),
    viewId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    allowSensitive: new FormControl(false, { nonNullable: true }),
  })

  protected readonly nameControl = this.form.controls.name
  protected readonly viewControl = this.form.controls.viewId
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

    this.options.set([
      ...BUILT_IN_VIEWS.map(view => ({
        id: view.id,
        label: this.$translate.instant(view.labelKey),
      })),
      ...this.$devices.views().map(view => ({ id: view.id, label: view.name })),
    ])
    this.form.patchValue({
      viewId: this.device?.viewId ?? this.preselectViewId ?? this.options()[0]?.id ?? '',
    })
    this.form.controls.viewId.valueChanges
      .pipe(takeUntilDestroyed(this.$destroyRef))
      .subscribe(() => this.updateCount())
    this.updateCount()
    this.loading.set(false)
  }

  private updateCount(): void {
    const view = this.chosenView()
    this.count.set(view
      ? this.$devices.resolveAllowed(view).length
      : null)
  }

  private chosenView() {
    return findKioskView(this.form.controls.viewId.value, this.$devices.views())
  }

  protected async save(): Promise<void> {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched()
      return
    }
    const view = this.chosenView()
    const option = this.options().find(entry => entry.id === this.form.controls.viewId.value)
    if (!view || !option) {
      this.form.controls.viewId.markAsTouched()
      return
    }

    this.saving.set(true)
    try {
      const input = {
        name: this.form.controls.name.value.trim(),
        viewId: option.id,
        viewName: option.label,
        allowSensitive: this.form.controls.allowSensitive.value,
        allowedUniqueIds: this.$devices.resolveAllowed(view),
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
