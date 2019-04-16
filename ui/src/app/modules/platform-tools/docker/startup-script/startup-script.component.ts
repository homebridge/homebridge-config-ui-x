import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import 'brace/theme/xcode';
import 'brace/mode/sh';

import { ApiService } from '../../../../core/api.service';
import { MobileDetectService } from '../../../../core/mobile-detect.service';

@Component({
  selector: 'app-startup-script',
  templateUrl: './startup-script.component.html',
  styleUrls: ['./startup-script.component.scss'],
})
export class StartupScriptComponent implements OnInit {
  public startupScript: string;
  public options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    private $md: MobileDetectService,
    public $toastr: ToastrService,
    private translate: TranslateService,
    private $route: ActivatedRoute,
  ) {
    // remove editor gutter on small screen devices
    if ($md.detect.phone()) {
      this.options.showGutter = false;
    }

    // make font size 16px on mobile devices to prevent zoom
    if ($md.detect.mobile()) {
      this.options.fontSize = '16px';
    }
  }

  ngOnInit() {
    this.$route.data
      .subscribe((data: { startupScript: { script: string } }) => {
        this.startupScript = data.startupScript.script;
      });
  }

  onSave() {
    // check startup script is using the correct hashbang
    if (this.startupScript.split('\n')[0].trim() !== '#!/bin/sh') {
      this.$toastr.error(
        this.translate.instant('platform.docker.startup_script.toast_script_must_use_hashbang'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_error'),
      );
      this.startupScript = '#!/bin/sh\n\n' + this.startupScript;
      return;
    }

    this.$api.put('/platform-tools/docker/startup-script', { script: this.startupScript }).subscribe(
      data => this.$toastr.success(
        this.translate.instant('platform.docker.startup_script.toast_restart_required'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_saved'),
      ),
      err => this.$toastr.error(err.message, this.translate.instant('toast.title_error')),
    );
  }

}
