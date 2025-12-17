import { NgClass } from '@angular/common'
import { ChangeDetectorRef, Component, Input } from '@angular/core'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-garage-door-opener',
  templateUrl: './garage-door-opener.component.html',
  styleUrls: ['./garage-door-opener.component.scss'],
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
  ],
})
export class GarageDoorOpenerComponent {
  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public alertAnnouncement = ''

  private clearTimer: any
  private lastActivateAt = 0
  private zwsFlip = false

  constructor(
    private $translate: TranslateService,
    private cdr: ChangeDetectorRef,
  ) {}

  public onActivate() {
    const now = Date.now()
    if (now - this.lastActivateAt < 250) {
      return
    }
    this.lastActivateAt = now

    if (!this.readyForControl || !this.service?.values) {
      return
    }

    const announcement = this.buildActionAnnouncement()

    if ('TargetDoorState' in this.service.values) {
      const nextTarget = this.service.values.TargetDoorState ? 0 : 1
      this.service.getCharacteristic('TargetDoorState').setValue(nextTarget)
    } else if ('On' in this.service.values) {
      this.service.getCharacteristic('On').setValue(!this.service.values.On)
    } else if ('Active' in this.service.values) {
      this.service.getCharacteristic('Active').setValue(!this.service.values.Active)
    }

    if (announcement) {
      this.announceViaAlert(announcement)
    }
  }

  private buildActionAnnouncement(): string {
    const name = this.service?.customName || this.service?.serviceName || ''

    if (this.service?.values?.ObstructionDetected) {
      const obstructed = this.$translate.instant('accessories.control.obstructed')
      return name ? `${name}, ${obstructed}` : obstructed
    }

    if ('TargetDoorState' in this.service.values) {
      const nextTarget = this.service.values.TargetDoorState ? 0 : 1
      const actionKey = nextTarget === 0 ? 'accessories.control.opening' : 'accessories.control.closing'
      const action = this.$translate.instant(actionKey)
      return name ? `${name}, ${action}` : action
    }

    if ('On' in this.service.values) {
      const nextOn = !this.service.values.On
      const action = this.$translate.instant(nextOn ? 'accessories.control.opening' : 'accessories.control.closing')
      return name ? `${name}, ${action}` : action
    }

    if ('Active' in this.service.values) {
      const nextActive = !this.service.values.Active
      const action = this.$translate.instant(nextActive ? 'accessories.control.opening' : 'accessories.control.closing')
      return name ? `${name}, ${action}` : action
    }

    return name
  }

  private announceViaAlert(message: string) {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer)
      this.clearTimer = undefined
    }

    this.alertAnnouncement = ''
    this.cdr.detectChanges()

    this.zwsFlip = !this.zwsFlip
    const zws = this.zwsFlip ? '\u200B' : '\u200C'

    setTimeout(() => {
      this.alertAnnouncement = `${message}${zws}`
      this.cdr.detectChanges()

      this.clearTimer = setTimeout(() => {
        this.alertAnnouncement = ''
        this.cdr.detectChanges()
        this.clearTimer = undefined
      }, 1200)
    }, 250)
  }
}
