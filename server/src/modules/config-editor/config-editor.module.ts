import { Module } from '@nestjs/common';
import { ConfigEditorService } from './config-editor.service';

@Module({
  providers: [ConfigEditorService],
})
export class ConfigEditorModule { }
