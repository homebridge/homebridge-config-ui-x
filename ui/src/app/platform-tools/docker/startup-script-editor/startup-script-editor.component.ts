import { Component, OnInit, Input } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { StateService } from '@uirouter/angular';
import { ApiService } from '../../../_services/api.service';
import { MobileDetectService } from '../../../_services/mobile-detect.service';

import 'brace/theme/xcode';
import 'brace/mode/sh';

@Component({
  selector: 'app-startup-script-editor',
  templateUrl: './startup-script-editor.component.html'
})
export class StartupScriptEditorComponent implements OnInit {
  @Input() startupScript;
  options: any = { printMargin: false };

  constructor(
    private $api: ApiService,
    private $md: MobileDetectService,
    public toastr: ToastrService,
    private translate: TranslateService,
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
  }

  onSave() {
    // check startup script is using the correct hashbang
    if (this.startupScript.split('\n')[0].trim() !== '#!/bin/sh') {
      this.toastr.error(
        this.translate.instant('platform.docker.startup_script.toast_script_must_use_hashbang'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_error')
      );
      this.startupScript = '#!/bin/sh\n\n' + this.startupScript;
      return;
    }

    this.$api.dockerSaveStartupScript({ script: this.startupScript }).subscribe(
      data => this.toastr.success(
        this.translate.instant('platform.docker.startup_script.toast_restart_required'),
        this.translate.instant('platform.docker.startup_script.toast_title_script_saved')
      ),
      err =>  this.toastr.error(err.message, this.translate.instant('toast.title_error'))
    );
  }

}

export function startupScriptStateResolve($api, toastr, $state) {
  return $api.dockerGetStartupScript().toPromise().catch((err) => {
    toastr.error(err.message, 'Failed to Load Startup Script');
    $state.go('status');
  });
}


export const StartupScriptEditorStates = {
  name: 'docker.startup-script',
  url: '/startup-script',
  views: {
    '!$default': { component: StartupScriptEditorComponent }
  },
  resolve: [{
    token: 'startupScript',
    deps: [ApiService, ToastrService, StateService],
    resolveFn: startupScriptStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
