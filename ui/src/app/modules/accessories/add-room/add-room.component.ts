import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core'
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

import { RequiredIndicatorComponent } from '@/app/core/components/required-indicator/required-indicator.component'
import { ADD_ROOM_MODAL_DATA } from '@/app/modules/accessories/modal-data-tokens'

@Component({
  selector: 'app-add-room',
  imports: [ReactiveFormsModule, TranslatePipe, RequiredIndicatorComponent],
  standalone: true,
  templateUrl: './add-room.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddRoomComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private data = inject(ADD_ROOM_MODAL_DATA)

  public existingRooms: Array<{ name: string, isDefault?: boolean }> = this.data.existingRooms

  public roomForm = new FormGroup({
    roomName: new FormControl('', [Validators.required]),
    isDefault: new FormControl(false),
  })

  public ngOnInit() {
    // Add custom validator after we have access to existingRooms
    this.roomForm.controls.roomName.addValidators(this.duplicateRoomNameValidator.bind(this))
    this.roomForm.controls.roomName.updateValueAndValidity()

    // If there are no existing rooms (edge case), this must be the default room
    if (this.existingRooms.length === 0) {
      this.roomForm.patchValue({ isDefault: true })
    }
  }

  public get noExistingRooms(): boolean {
    return this.existingRooms.length === 0
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
      room => room.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    )

    return isDuplicate ? { duplicateRoom: true } : null
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal() {
    if (this.roomForm.invalid) {
      return
    }

    this.$activeModal.close({
      name: this.roomForm.value.roomName?.trim() || '',
      isDefault: this.roomForm.value.isDefault || false,
    })
  }
}
