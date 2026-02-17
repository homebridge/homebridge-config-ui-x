import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  standalone: true,
})
export class SpinnerComponent {}
