/* global NodeJS */
import { DatePipe, NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { NgbActiveModal, NgbAlert } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe, TranslateService } from '@ngx-translate/core'
import { ToastrService } from 'ngx-toastr'

import { ApiService } from '@/app/core/api.service'
import { ApiToken, User } from '@/app/modules/users/users.interface'

@Component({
  templateUrl: './users-api-tokens.component.html',
  standalone: true,
  imports: [
    NgbAlert,
    FormsModule,
    ReactiveFormsModule,
    TranslatePipe,
    DatePipe,
    NgClass,
  ],
})
export class UsersApiTokensComponent implements OnInit {
  private $activeModal = inject(NgbActiveModal)
  private $api = inject(ApiService)
  private $toastr = inject(ToastrService)
  private $translate = inject(TranslateService)
  private copyTimeout: NodeJS.Timeout | null = null

  @Input() public user: User

  public apiTokens: ApiToken[] = []
  public newToken: ApiToken | null = null
  public tokenCopied = false
  public showCreateForm = false

  public formGroup = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(1)]),
  })

  public ngOnInit(): void {
    this.loadTokens()
  }

  private loadTokens(): void {
    this.$api.get('/users/api-tokens').subscribe({
      next: (tokens: ApiToken[]) => {
        this.apiTokens = tokens
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('users.api_tokens_failed_to_create'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public createToken(): void {
    if (!this.formGroup.valid) {
      return
    }

    this.$api.post('/users/api-tokens', this.formGroup.value).subscribe({
      next: (token: ApiToken) => {
        this.newToken = token
        this.showCreateForm = false
        this.formGroup.reset()
        this.loadTokens()
        this.$toastr.success(this.$translate.instant('users.api_tokens_token_created'), this.$translate.instant('toast.title_success'))
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('users.api_tokens_failed_to_create'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public deleteToken(token: ApiToken): void {
    this.$api.delete(`/users/api-tokens/${token.id}`).subscribe({
      next: () => {
        this.loadTokens()
        this.$toastr.success(this.$translate.instant('users.api_tokens_token_deleted'), this.$translate.instant('toast.title_success'))
      },
      error: (error) => {
        console.error(error)
        this.$toastr.error(this.$translate.instant('users.api_tokens_failed_to_delete'), this.$translate.instant('toast.title_error'))
      },
    })
  }

  public async copyTokenToClipboard(): Promise<void> {
    if (!this.newToken?.token) {
      return
    }

    await navigator.clipboard.writeText(this.newToken.token)
    this.tokenCopied = true
    this.$toastr.success(this.$translate.instant('users.api_tokens_token_copied'), this.$translate.instant('toast.title_success'))

    if (this.copyTimeout) {
      clearTimeout(this.copyTimeout)
    }

    this.copyTimeout = setTimeout(() => {
      this.tokenCopied = false
    }, 3000)
  }

  public closeNewTokenAlert(): void {
    this.newToken = null
  }

  public toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm
    if (!this.showCreateForm) {
      this.formGroup.reset()
    }
  }

  public dismissModal(): void {
    this.$activeModal.dismiss('Dismiss')
  }
}
