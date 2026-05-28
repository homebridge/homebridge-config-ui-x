import {
  ChangeDetectionStrategy,
  Component,
  createEnvironmentInjector,
  DestroyRef,
  EnvironmentInjector,
  inject,
  input,
  OnInit,
  signal,
  StaticProvider,
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { interval, startWith, Subject, switchMap } from 'rxjs'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { LIGHTBULB_ADAPTIVE_LIGHTING, LightbulbManageComponent } from '@/app/core/accessories/types/hap/lightbulb/lightbulb.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'
import { ColourService } from '@/app/core/utilities/colour.service'

@Component({
  selector: 'app-lightbulb',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './lightbulb.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LightbulbComponent implements OnInit {
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)
  private pollingRate$ = new Subject<number>()

  public $colour = inject(ColourService)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public readonly hasAdaptiveLighting = signal(false)
  public readonly isAdaptiveLightingEnabled = signal(false)

  public ngOnInit() {
    this.loadAdaptiveLighting()
  }

  public getBulbFill(): string {
    const values = this.service().values
    if (!(values?.On || values?.Active)) {
      return 'none'
    }

    if ('Hue' in values) {
      return `hsl(${values?.Hue}, ${values?.Saturation}%, 50%)`
    }

    if ('ColorTemperature' in values) {
      return this.$colour.kelvinToHsl(this.$colour.miredToKelvin(values?.ColorTemperature))
    }
    return '#ffcf55'
  }

  public getBrightnessLabel(): string {
    const values = this.service().values
    if (!values?.On) {
      return ''
    }

    let label = `${values?.Brightness}%`
    if (this.hasAdaptiveLighting()) {
      const cls = this.isAdaptiveLightingEnabled() ? 'on-text' : 'grey-text'
      label += ` &middot; <i class='fas fa-sun ${cls}'></i>`
    }
    if (this.hasCurrentConsumption()) {
      label += ` &middot; ${this.currentConsumption()}W`
    }

    return label
  }

  public getOnOffLabel(): string {
    const values = this.service().values
    const isOn = values?.On || values?.Active
    if (!isOn) {
      return ''
    }
    let label = ''
    if (this.hasAdaptiveLighting()) {
      const cls = this.isAdaptiveLightingEnabled() ? 'on-text' : 'grey-text'
      label += ` &middot; <i class='fas fa-sun ${cls}'></i>`
    }
    if (this.hasCurrentConsumption()) {
      label += ` &middot; ${this.currentConsumption()}W`
    }
    return label
  }

  public hasCurrentConsumption(): boolean {
    return 'Consumption' in this.service().values
  }

  public currentConsumption(): number | undefined {
    if (!this.hasCurrentConsumption()) {
      return undefined
    }

    return this.service().values.Consumption
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('On' in this.service().values) {
      void this.service().getCharacteristic!('On').setValue!(!this.service().values.On)
    } else if ('Active' in this.service().values) {
      void this.service().getCharacteristic!('Active').setValue!(this.service().values.Active ? 0 : 1)
    }

    // Set the brightness to max if on 0% when turned on
    if ('Brightness' in this.service().values && !this.service().values.On && !this.service().values.Brightness) {
      this.service().values.Brightness = this.service().getCharacteristic!('Brightness').maxValue
    }
  }

  public async onLongClick(): Promise<void> {
    if (!this.readyForControl()) {
      return
    }

    if ('Brightness' in this.service().values || 'Hue' in this.service().values || 'Saturation' in this.service().values || 'ColorTemperature' in this.service().values) {
      // Create modal-specific injector with base accessory data and optional lightbulb-specific data
      const providers: StaticProvider[] = [
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: {
            service: this.service(),
            $accessories: this.$accessories,
          },
        },
      ]

      // Add lightbulb-specific data if adaptive lighting is available
      if (this.hasAdaptiveLighting()) {
        providers.push({
          provide: LIGHTBULB_ADAPTIVE_LIGHTING,
          useValue: this.isAdaptiveLightingEnabled,
        })
      }

      const modalInjector = createEnvironmentInjector(providers, this.injector)

      const ref = this.$modal.open(LightbulbManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })

      // Handle adaptive lighting interval management
      if (this.hasAdaptiveLighting()) {
        // Switch to fast polling (every 3 seconds) while modal is open
        this.pollingRate$.next(3000)

        // Reset to slow polling when the modal is closed
        try {
          await ref.result
        } catch {
          // Modal dismissed
        } finally {
          this.pollingRate$.next(30000)
        }
      }
    }
  }

  private loadAdaptiveLighting() {
    if ('CharacteristicValueActiveTransitionCount' in this.service().values) {
      this.hasAdaptiveLighting.set(true)
      this.isAdaptiveLightingEnabled.set(!!this.service().values.CharacteristicValueActiveTransitionCount)

      this.pollingRate$.pipe(
        startWith(30000),
        switchMap(rate => interval(rate)),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(() => {
        this.isAdaptiveLightingEnabled.set(!!this.service().values.CharacteristicValueActiveTransitionCount)
      })
    }
  }

  protected readonly Math = Math
}
