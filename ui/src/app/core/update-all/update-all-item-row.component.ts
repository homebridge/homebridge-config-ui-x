import { ChangeDetectionStrategy, Component, input } from '@angular/core'

/**
 * One row of an Update All list: the plugin's icon, its name, and the version
 * jump. The confirm modal and the progress modal both render this, so the two
 * lists cannot drift apart - only the right-hand slot differs between them
 * (a toggle while choosing, a status while running).
 */
@Component({
  selector: 'app-update-all-item-row',
  standalone: true,
  templateUrl: './update-all-item-row.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateAllItemRowComponent {
  public readonly displayName = input.required<string>()
  public readonly icon = input<string | null | undefined>(null)
  public readonly from = input.required<string>()
  public readonly to = input.required<string>()

  /** The Homebridge logo, used for the UI and Homebridge themselves and for any plugin without an icon */
  public readonly defaultIcon = 'assets/hb-icon.png'

  public handleIconError(event: Event): void {
    (event.target as HTMLImageElement).src = this.defaultIcon
  }
}
