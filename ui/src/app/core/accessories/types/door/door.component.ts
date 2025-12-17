import { NgClass } from '@angular/common'
import { ChangeDetectorRef, Component, inject, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { Subject, interval } from 'rxjs'
import { takeUntil } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'
import { DoorManageComponent } from '@/app/core/accessories/types/door/door.manage.component'
import { LongClickDirective } from '@/app/core/directives/long-click.directive'

@Component({
  selector: 'app-door',
  templateUrl: './door.component.html',
  styleUrls: ['./door.component.scss'],
  standalone: true,
  imports: [
    LongClickDirective,
    NgClass,
    TranslatePipe,
  ],
})
export class DoorComponent implements OnChanges, OnDestroy {
  private $modal = inject(NgbModal)
  private translateService = inject(TranslateService)
  private cdr = inject(ChangeDetectorRef)
  private destroy$ = new Subject<void>()

  @Input() public service: ServiceTypeX
  @Input() public readyForControl = false

  public stateAnnouncement = ''
  public accessibleLabel = ''
  
  private lastPosition = -1
  private lastPositionState = -1

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['service'] && this.service) {
      this.setupPolling()
      this.updateAccessibleLabel()
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  private setupPolling(): void {
    // Poll for state changes every 500ms
    interval(500)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.hasStateChanged()) {
          this.updateAccessibleLabel()
        }
      })
  }

  private hasStateChanged(): boolean {
    if (!this.service) return false
    
    const changed = this.lastPosition !== this.service.values.CurrentPosition || 
                    this.lastPositionState !== this.service.values.PositionState
    
    if (changed) {
      this.lastPosition = this.service.values.CurrentPosition
      this.lastPositionState = this.service.values.PositionState
    }
    
    return changed
  }

  private updateAccessibleLabel(): void {
    if (!this.service) return
    
    const name = this.service.customName || this.service.serviceName
    const state = this.getCurrentStateText()
    const hint = this.translateService.instant('accessories.control.hint')
    this.accessibleLabel = `${name}, ${state}, ${hint}`
    this.cdr.markForCheck()
  }

  private getCurrentStateText(): string {
    if (!this.service) return ''
    
    if (this.service.values.PositionState === 1) {
      return this.translateService.instant('accessories.control.opening')
    } else if (this.service.values.PositionState === 0) {
      return this.translateService.instant('accessories.control.closing')
    } else if (this.service.values.CurrentPosition === 0) {
      return this.translateService.instant('accessories.control.closed')
    } else if (this.service.values.CurrentPosition === 100) {
      return this.translateService.instant('accessories.control.open')
    } else if (this.service.values.CurrentPosition > 0 && this.service.values.CurrentPosition < 100) {
      return `${this.translateService.instant('accessories.control.open')} ${this.service.values.CurrentPosition}%`
    }
    return ''
  }

  public onClick() {
    if (!this.readyForControl) {
      return
    }

    const isOpen = this.service.values.TargetPosition > 0
    const newState = isOpen ? 0 : 100
    
    this.service.getCharacteristic('TargetPosition').setValue(newState)
    
    // Announce the action being taken
    const announcement = newState === 100 
      ? this.translateService.instant('accessories.control.opening')
      : this.translateService.instant('accessories.control.closing')
    
    this.announceState(announcement)
  }

  public onKeyDown(event: KeyboardEvent) {
    // Handle Shift+F10 for immediate secondary action (open dialog)
    if (event.shiftKey && event.key === 'F10') {
      event.preventDefault()
      event.stopPropagation()
      this.onLongClick()
    }
  }

  public onLongClick() {
    if (!this.readyForControl) {
      return
    }

    const ref = this.$modal.open(DoorManageComponent, {
      size: 'md',
      backdrop: 'static',
    })
    ref.componentInstance.service = this.service
  }

  private announceState(text: string): void {
    // Clear first to ensure change detection picks it up
    this.stateAnnouncement = ''
    this.cdr.detectChanges()
    
    // Set new announcement
    setTimeout(() => {
      this.stateAnnouncement = text
      this.cdr.detectChanges()
      
      // Clear after 2 seconds
      setTimeout(() => {
        this.stateAnnouncement = ''
        this.cdr.detectChanges()
      }, 2000)
    }, 100)
  }
}
