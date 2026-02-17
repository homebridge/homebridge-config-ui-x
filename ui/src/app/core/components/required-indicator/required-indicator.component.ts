import { ChangeDetectionStrategy, Component } from '@angular/core'

@Component({
  selector: 'app-required-indicator',
  standalone: true,
  templateUrl: './required-indicator.component.html',
  styleUrl: './required-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequiredIndicatorComponent {}
