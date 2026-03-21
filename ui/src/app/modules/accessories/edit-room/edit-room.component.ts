import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { EDIT_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'

@Component({
  selector: 'app-edit-room',
  imports: [ReactiveFormsModule, TranslatePipe, RequiredIndicatorComponent],
  standalone: true,
  templateUrl: './edit-room.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditRoomComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private data = inject(EDIT_ROOM_MODAL_DATA)

  public roomName: string = this.data.roomName
  public isDefault: boolean = this.data.isDefault
  public existingRooms: Array<{ name: string, isDefault?: boolean }> = this.data.existingRooms
  public currentRoomIndex: number = this.data.currentRoomIndex

  public readonly deleteMode = signal(false)
  public readonly formWasInvalid = signal(false)

  private initialFormValue: { roomName: string | null, isDefault: boolean | null } = { roomName: null, isDefault: null }

  public roomForm = new FormGroup({
    roomName: new FormControl('', [Validators.required]),
    isDefault: new FormControl(false),
  })

  public ngOnInit() {
    // Set initial values
    this.roomForm.patchValue({
      roomName: this.roomName,
      isDefault: this.isDefault,
    })

    // Store initial form value for change detection
    this.initialFormValue = this.roomForm.getRawValue()

    // Add custom validator after we have access to existingRooms
    this.roomForm.controls.roomName.addValidators(this.duplicateRoomNameValidator.bind(this))
    this.roomForm.controls.roomName.updateValueAndValidity()

    // Disable the isDefault checkbox if this is the only room OR if it's currently the default room
    // (can't uncheck default - must always have exactly one default room)
    if (this.isOnlyRoom() || this.isDefault) {
      this.roomForm.controls.isDefault.disable()
    }
  }

  private duplicateRoomNameValidator(control: AbstractControl): { [key: string]: boolean } | null {
    if (!control.value) {
      return null
    }

    const trimmedName = control.value.trim()
    if (!trimmedName) {
      return null
    }

    const isDuplicate = this.existingRooms.some(
      (room, index) =>
        index !== this.currentRoomIndex
        && room.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )

    return isDuplicate ? { duplicateRoom: true } : null
  }

  public readonly isOnlyRoom = computed(() => this.existingRooms.length === 1)

  public readonly targetRoomName = computed(() => {
    if (this.isDefault) {
      // If deleting default room, accessories go to the first other room (which will become new default)
      const otherRooms = this.existingRooms.filter((_, index) => index !== this.currentRoomIndex)
      return otherRooms[0]?.name || ''
    } else {
      // If deleting non-default room, accessories go to current default room
      const defaultRoom = this.existingRooms.find(r => r.isDefault)
      return defaultRoom?.name || this.existingRooms[0]?.name || ''
    }
  })

  public readonly newDefaultRoomName = computed(() => {
    // Only relevant if current room is default
    if (!this.isDefault) {
      return ''
    }
    const otherRooms = this.existingRooms.filter((_, index) => index !== this.currentRoomIndex)
    return otherRooms[0]?.name || ''
  })

  public toggleDeleteMode(event: MouseEvent) {
    this.deleteMode.set(!this.deleteMode())

    if (this.deleteMode()) {
      // Store whether form was invalid before entering delete mode
      this.formWasInvalid.set(this.roomForm.invalid)
      // Disable the form
      this.roomForm.disable()
    } else {
      // Re-enable the form
      this.roomForm.enable()
      // Re-disable the isDefault checkbox if this is the only room OR if it's currently the default room
      if (this.isOnlyRoom() || this.isDefault) {
        this.roomForm.controls.isDefault.disable()
      }
    }

    // Remove focus from the button
    ;(event.target as HTMLElement).blur()
  }

  public isFormUnchanged(): boolean {
    return JSON.stringify(this.roomForm.getRawValue()) === JSON.stringify(this.initialFormValue)
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    // In delete mode, we don't need form to be valid
    if (!this.deleteMode() && this.roomForm.invalid) {
      return
    }

    if (this.deleteMode()) {
      // Return delete flag
      this.$activeModal.close({
        delete: true,
      })
    } else {
      // Return updated room data
      // Use getRawValue() to include disabled controls (like isDefault when it's the only room)
      const formValue = this.roomForm.getRawValue()
      this.$activeModal.close({
        name: formValue.roomName?.trim() || '',
        isDefault: formValue.isDefault || false,
      })
    }
  }
}
