import { Component, Input, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-confirm',
  templateUrl: './confirm.component.html',
  styleUrls: ['./confirm.component.scss'],
})
export class ConfirmComponent implements OnInit {
  @Input() title;
  @Input() message;
  @Input() confirmButtonLabel;
  @Input() cancelButtonLabel;

  constructor(
    public activeModal: NgbActiveModal,
    private translate: TranslateService,
  ) { }

  ngOnInit() {
    if (!this.cancelButtonLabel) {
      this.cancelButtonLabel = this.translate.instant('form.button_cancel');
    }
  }

}
