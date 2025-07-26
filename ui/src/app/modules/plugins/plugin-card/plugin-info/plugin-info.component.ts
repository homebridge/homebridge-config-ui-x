import { NgClass, NgStyle } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'

import { Plugin } from '@/app/core/manage-plugins/manage-plugins.interfaces'

@Component({
  templateUrl: './plugin-info.component.html',
  styleUrls: ['./plugin-info.component.scss'],
  standalone: true,
  imports: [TranslatePipe, NgClass, NgStyle],
})
export class PluginInfoComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)

  @Input() plugin: Plugin

  public readonly defaultIcon = 'assets/hb-icon.png'
  public readonly linkScoped = '<a href="https://github.com/homebridge/plugins/wiki/Scoped-Plugins" target="_blank"><i class="fas fa-fw fa-external-link-alt primary-text"></i></a>'
  public readonly linkVerified = '<a href="https://github.com/homebridge/plugins/wiki/Verified-Plugins" target="_blank"><i class="fas fa-fw fa-external-link-alt primary-text"></i></a>'

  public ngOnInit() {
    if (!this.plugin.icon) {
      this.plugin.icon = this.defaultIcon
    }
  }

  public handleIconError() {
    this.plugin.icon = this.defaultIcon
  }

  public dismissModal() {
    this.$activeModal.dismiss('Dismiss')
  }
}
