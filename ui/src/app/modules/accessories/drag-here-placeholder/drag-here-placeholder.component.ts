import { Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-drag-here-placeholder',
  templateUrl: './drag-here-placeholder.component.html',
  styleUrl: './drag-here-placeholder.component.scss',
  standalone: true,
  imports: [TranslatePipe],
})
export class DragHerePlaceholderComponent {}
