import { NgClass } from '@angular/common'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import { TranslatePipe } from '@ngx-translate/core'
import { NouisliderComponent } from 'ng2-nouislider'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

import { ServiceTypeX } from '@/app/core/accessories/accessories.interfaces'

@Component({
  selector: 'app-lockmanagement-manage',
  templateUrl: './lockmanagement.manage.component.html',
  standalone: true,
  imports: [
    FormsModule,
    NouisliderComponent,
    TranslatePipe,
    NgClass,
  ],
})
export class LockmanagementManageComponent implements OnInit {
  $activeModal = inject(NgbActiveModal)

  @Input() public service: ServiceTypeX
  public targetLockManagementAutoSecurityTimeout: any
  public targetLockManagementAutoSecurityTimeoutChanged: Subject<string> = new Subject<string>()

  constructor() {
    this.targetLockManagementAutoSecurityTimeoutChanged
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
      )
      .subscribe(() => {
        this.service.getCharacteristic('LockManagementAutoSecurityTimeout').setValue(this.targetLockManagementAutoSecurityTimeout.value)
      })
  }

  ngOnInit() {
    this.loadTargetLockManagementAutoSecurityTimeout()
  }

  loadTargetLockManagementAutoSecurityTimeout() {
    const TargetLockManagementAutoSecurityTimeout = this.service.getCharacteristic('LockManagementAutoSecurityTimeout')

    if (TargetLockManagementAutoSecurityTimeout) {
      this.targetLockManagementAutoSecurityTimeout = {
        value: TargetLockManagementAutoSecurityTimeout.value || 0,
        min: TargetLockManagementAutoSecurityTimeout.minValue || 0,
        max: TargetLockManagementAutoSecurityTimeout.maxValue || 3600,
        step: TargetLockManagementAutoSecurityTimeout.minStep || 1,
      }
    }
  }

  onLockManagementAutoSecurityTimeoutStateChange() {
    this.targetLockManagementAutoSecurityTimeoutChanged.next(this.targetLockManagementAutoSecurityTimeout.value)
  }
}
