import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap/modal'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './add-room.component.html',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
})
export class AddRoomComponent {
  private $activeModal = inject(NgbActiveModal)

  public roomName: string = ''

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }

  public closeModal(roomName: string) {
    this.$activeModal.close(roomName)
  }
}
