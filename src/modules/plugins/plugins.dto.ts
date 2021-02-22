import { IsDefined, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class PluginActionDto {
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Matches(/^((@[\w-]*)\/)?(homebridge-[\w-]*)$/)
  name: string;

  @IsOptional()
  @IsString()
  version?: string;
}

export class HomebridgeUpdateActionDto {
  @IsOptional()
  @IsString()
  version?: string;
}
