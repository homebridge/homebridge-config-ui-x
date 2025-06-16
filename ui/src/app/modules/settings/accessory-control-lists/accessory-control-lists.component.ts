import { NgClass, TitleCasePipe } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal, NgbTooltip } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'

import { ApiService } from '@/app/core/api.service'
import { SettingsService } from '@/app/core/settings.service'

@Component({
  templateUrl: './accessory-control-lists.component.html',
  standalone: true,
  imports: [
    NgClass,
    TranslatePipe,
    FormsModule,
    TitleCasePipe,
    NgbTooltip,
  ],
})
export class AccessoryControlListsComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $settings = inject(SettingsService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)

  private originalBlacklist: string[] = []
  private updatedBlacklist: string[] = []

  @Input() existingBlacklist: string[] = []

  public clicked: boolean = false
  public mainPairing: any = {}
  public pairings: any[] = []

  constructor() {}

  get blacklistHasUpdated() {
    return this.updatedBlacklist.join(',') !== this.originalBlacklist.join(',')
  }

  async ngOnInit(): Promise<void> {
    this.updatedBlacklist = this.existingBlacklist
      .map(x => x.trim().toUpperCase())
      .sort((a, b) => a.localeCompare(b))
    this.originalBlacklist = [...this.updatedBlacklist]

    try {
      const pairings = await firstValueFrom(this.$api.get('/server/pairings'))
      this.mainPairing = pairings.find(p => p._main)
      this.pairings = pairings
        .filter(p => !p._main)
        .sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
      this.$activeModal.close()
    }
  }

  toggleList(username: string) {
    if (this.updatedBlacklist.includes(username)) {
      this.updatedBlacklist = this.updatedBlacklist.filter(x => x !== username)
    } else {
      this.updatedBlacklist.push(username)
      this.updatedBlacklist.sort((a, b) => a.localeCompare(b))
    }
  }

  isInList(username: string) {
    return this.updatedBlacklist.includes(username)
  }

  async updateBlacklist() {
    this.clicked = true
    try {
      await firstValueFrom(this.$api.put('/config-editor/ui/accessory-control/instance-blacklist', {
        body: this.updatedBlacklist,
      }))
      this.$settings.setEnvItem('accessoryControl.instanceBlacklist', this.updatedBlacklist)
      this.$activeModal.close()
    } catch (error) {
      this.clicked = false
      console.error(error)
      this.$toastr.error(error.message, this.$translate.instant('toast.title_error'))
    }
  }
}
