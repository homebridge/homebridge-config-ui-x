import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-required-indicator',
  templateUrl: './required-indicator.component.html',
  styleUrl: './required-indicator.component.scss',
  standalone: true,
})
export class RequiredIndicatorComponent {}
