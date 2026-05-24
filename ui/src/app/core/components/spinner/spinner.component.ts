import { ChangeDetectionStrategy, Component } from '@angular/core'
import { TranslatePipe } from '@ngx-translate/core'

@Component({
  selector: 'app-spinner',
  imports: [TranslatePipe],
  standalone: true,
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpinnerComponent {}
