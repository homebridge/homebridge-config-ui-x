import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator'

export class HomebridgeUpdateActionDto {
  @IsOptional()
  @IsString()
  version?: string

  @IsOptional()
  @IsNumber()
  termCols?: number

  @IsOptional()
  @IsNotEmpty()
  termRows?: number
}

export class PluginActionDto {
  @IsDefined()
  @IsNotEmpty()
  @IsString()
  @Matches(/^(@[\w-]+(\.[\w-]+)*\/)?homebridge-[\w-]+$/)
  name: string

  // Semver-shaped: alphanumerics, dots, dashes, dist-tag chars, range
  // operators. Mirrors the regex used by hb-service so the in-UI install
  // path can't accept a version like "--evil-flag" or "1.0; rm -rf /"
  // that the validator-less version of this field would have passed
  // through to the npm argv.
  @IsOptional()
  @IsString()
  @Matches(/^[\w.\-^~>=<*|+]+$/)
  version?: string

  @IsOptional()
  @IsNumber()
  termCols?: number

  @IsOptional()
  @IsNotEmpty()
  termRows?: number
}
