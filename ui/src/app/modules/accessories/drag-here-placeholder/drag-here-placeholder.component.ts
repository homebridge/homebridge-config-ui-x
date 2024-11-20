import { Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-drag-here-placeholder',
  templateUrl: './drag-here-placeholder.component.html',
  styleUrls: ['./drag-here-placeholder.component.scss'],
  imports: [TranslatePipe],
})
export class DragHerePlaceholderComponent {
  constructor() {}
}
