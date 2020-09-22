import { IsDefined, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

// tslint:disable-next-line: max-classes-per-file
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

// tslint:disable-next-line: max-classes-per-file
export class HomebridgeUpdateActionDto {
  @IsOptional()
  @IsString()
  version?: string;
}