import { AppModule } from '@/app/app.module'
import { environment } from '@/environments/environment'
import { enableProdMode } from '@angular/core'
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'

import '../../src/globalDefaults'

if (environment.production) {
  enableProdMode()
}

// eslint-disable-next-line no-console
platformBrowserDynamic().bootstrapModule(AppModule).catch(err => console.log(err))
