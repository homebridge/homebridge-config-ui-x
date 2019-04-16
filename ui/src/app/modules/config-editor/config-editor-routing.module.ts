import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ConfigEditorComponent } from './config-editor.component';
import { ConfigEditorResolver } from './config-editor.resolver';

const routes: Routes = [
  {
    path: '',
    component: ConfigEditorComponent,
    resolve: {
      config: ConfigEditorResolver,
    },
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ConfigEditorRoutingModule { }
