import type { ServiceType } from '@homebridge/hap-client'

import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

import { BaseManageComponent } from '@/app/core/accessories/types/base-manage.component'
import { cameraPart } from '@/app/core/accessories/types/hap/camera/camera-parts'

/**
 * The long-press window of a camera tile: the camera's motion sensor, and its microphone and
 * speaker, which can be muted here as they can in the Home app.
 */
@Component({
  selector: 'app-camera-manage',
  imports: [
    TranslatePipe,
  ],
  standalone: true,
  templateUrl: './camera.manage.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CameraManageComponent extends BaseManageComponent {
  public motionSensor?: ServiceType
  public microphone?: ServiceType
  public speaker?: ServiceType
  public isDoorbell = false

  protected setupComponent() {
    this.loadParts()
  }

  protected handleAccessoryUpdate() {
    // The parts are new objects after each update, linked to the new camera service
    this.loadParts()
  }

  public setMute(part: ServiceType, value: boolean, event: MouseEvent) {
    void part.getCharacteristic?.('Mute')?.setValue?.(value)

    this.blurTarget(event)
  }

  private loadParts() {
    this.motionSensor = cameraPart(this.service, 'MotionSensor')
    this.microphone = cameraPart(this.service, 'Microphone')
    this.speaker = cameraPart(this.service, 'Speaker')
    this.isDoorbell = !!cameraPart(this.service, 'Doorbell')
  }
}
