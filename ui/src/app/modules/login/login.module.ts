import { LoginComponent } from '@/app/modules/login/login.component'
import { LoginGuard } from '@/app/modules/login/login.guard'
import { CommonModule, NgOptimizedImage } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'

@NgModule({
  declarations: [
    LoginComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    NgOptimizedImage,
  ],
  providers: [
    LoginGuard,
  ],
})
export class LoginModule {}
