import { Component, OnInit, Input } from '@angular/core';

import { ToastsManager } from 'ng2-toastr/ng2-toastr';
import { StateService } from '@uirouter/angular';
import { ApiService } from '../../_services/api.service';

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
    public toastr: ToastsManager,
  ) { }

  ngOnInit() {
  }

  onSave() {
    // check startup script is using the correct hashbang
    if (this.startupScript.split('\n')[0].trim() !== '#!/bin/sh') {
      this.toastr.error('Script must use #!/bin/sh hashbang.', 'Script Error');
      this.startupScript = '#!/bin/sh\n\n' + this.startupScript;
      return;
    }

    this.$api.dockerSaveStartupScript({ script: this.startupScript }).subscribe(
      data => this.toastr.success('You will need to restart this docker container for the changes to take effect.', 'Startup Script Saved'),
      err =>  this.toastr.error(err.message, 'Error')
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
  name: 'docker-startup-script',
  url: '/docker/startup-script',
  component: StartupScriptEditorComponent,
  resolve: [{
    token: 'startupScript',
    deps: [ApiService, ToastsManager, StateService],
    resolveFn: startupScriptStateResolve
  }],
  data: {
    requiresAuth: true,
    requiresAdmin: true
  }
};
