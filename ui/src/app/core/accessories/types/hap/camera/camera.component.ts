import {
  ChangeDetectionStrategy,
  Component,
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  inject,
  input,
} from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { AccessoriesService } from '@/app/core/accessories/accessories.service'
import { ACCESSORY_MANAGE_MODAL_DATA } from '@/app/core/accessories/types/base-manage.component'
import { cameraPart } from '@/app/core/accessories/types/hap/camera/camera-parts'
import { CameraManageComponent } from '@/app/core/accessories/types/hap/camera/camera.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

/**
 * A camera or video doorbell, shown as one tile. It is built on the camera's video stream
 * service, with the camera's other parts folded in by AccessoriesService.attachPartsToCamera().
 */
@Component({
  selector: 'app-camera',
  imports: [
    LongClickDirective,
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './camera.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraComponent {
  private $accessories = inject(AccessoriesService)
  private injector = inject(EnvironmentInjector)
  private $modal = inject(NgbModal)

  public readonly service = input.required<ServiceTypeX>()
  public readonly readyForControl = input<boolean>(false)

  /** HomeKit requires a video doorbell to have a Doorbell service; a plain camera has none */
  public readonly isDoorbell = computed(() => !!cameraPart(this.service(), 'Doorbell'))

  public readonly motionSensor = computed(() => cameraPart(this.service(), 'MotionSensor'))

  public readonly motionDetected = computed(() => !!this.motionSensor()?.values?.MotionDetected)

  public onClick() {
    if (!this.readyForControl()) {
      return
    }

    const modalInjector = createEnvironmentInjector(
      [
        {
          provide: ACCESSORY_MANAGE_MODAL_DATA,
          useValue: {
            service: this.service(),
            $accessories: this.$accessories,
          },
        },
      ],
      this.injector,
    )

    this.$modal.open(CameraManageComponent, {
      size: 'md',
      backdrop: 'static',
      injector: modalInjector,
    })
  }
}
