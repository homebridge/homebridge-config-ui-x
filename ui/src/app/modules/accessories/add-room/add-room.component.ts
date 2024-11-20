import { Component, inject, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  templateUrl: './add-room.component.html',
  imports: [FormsModule, TranslatePipe],
})
export class AddRoomComponent {
  $activeModal = inject(NgbActiveModal)

  @Input() public roomName: string
}
