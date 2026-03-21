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
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'
import { interval } from 'rxjs'
import { filter } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { ValveManageComponent } from '@/app/core/accessories/types/hap/valve/valve.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-valve',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './valve.component.html',
  styleUrl: './valve.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValveComponent implements OnInit {
  private destroyRef = inject(DestroyRef)
  private injector = inject(EnvironmentInjector)
  private $accessories = inject(AccessoriesService)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  public secondsActive = 0
  public readonly remainingDuration = signal('')
  private readonly remainingDurationInterval = interval(1000).pipe(filter(() => this.isActive()))

  public ngOnInit() {
    // Set up the RemainingDuration countdown handlers, if the valve has the RemainingDuration Characteristic
    if ('SetDuration' in this.service().values) {
      this.setupRemainingDurationCounter()
    }
  }

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('Active' in this.service().values) {
      void this.service().getCharacteristic!('Active').setValue!(this.service().values.Active ? 0 : 1)
    } else if ('On' in this.service().values) {
      void this.service().getCharacteristic!('On').setValue!(!this.service().values.On)
    }
  }

  public onLongClick() {
    if (!this.readyForControl()) {
      return
    }

    if ('SetDuration' in this.service().values) {
      const modalInjector = createEnvironmentInjector(
        [{
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: {
            service: this.service(),
            $accessories: this.$accessories,
          },
        }],
        this.injector,
      )

      this.$modal.open(ValveManageComponent, {
        size: 'md',
        backdrop: 'static',
        injector: modalInjector,
      })
    }
  }

  private isActive() {
    if (this.service().values.Active) {
      return true
    } else {
      this.resetRemainingDuration()
      return false
    }
  }

  private setupRemainingDurationCounter() {
    this.remainingDurationInterval
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.secondsActive++
        const remainingSeconds = this.service().getCharacteristic!('RemainingDuration').value as number - this.secondsActive
        if (remainingSeconds > 0) {
          this.remainingDuration.set(remainingSeconds < 3600
            ? new Date(remainingSeconds * 1000).toISOString().substring(14, 19)
            : new Date(remainingSeconds * 1000).toISOString().substring(11, 19))
        } else {
          this.remainingDuration.set('')
        }
      })
  }

  private resetRemainingDuration() {
    this.secondsActive = 0
    if (this.service().getCharacteristic?.('RemainingDuration')) {
      this.remainingDuration.set('')
    }
  }
}
