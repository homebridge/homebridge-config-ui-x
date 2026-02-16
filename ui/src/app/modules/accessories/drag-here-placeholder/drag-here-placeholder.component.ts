import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-drag-here-placeholder',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './drag-here-placeholder.component.html',
  styleUrl: './drag-here-placeholder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DragHerePlaceholderComponent {}
