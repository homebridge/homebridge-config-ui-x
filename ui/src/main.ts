import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async'

import { AppComponent } from '@/app/app.component'
import { provideAppHttpClient } from '@/app/core/providers/http.providers'
import { provideAppRouting } from '@/app/core/providers/routing.providers'
import { provideAppTranslation } from '@/app/core/providers/translation.providers'
import { provideUiLibraries } from '@/app/core/providers/ui-libraries.providers'

import '../../src/globalDefaults'

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideAppRouting(),
    provideAppHttpClient(),
    provideAppTranslation(),
    provideUiLibraries(),
  ],
}).catch(err => console.error(err))
