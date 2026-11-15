import {
  IsDefined,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator'

import { RE_NPM_VERSION } from '../../core/regex.constants.js'

export class HomebridgeUpdateActionDto {
  @IsOptional()
  @IsString()
  @Matches(RE_NPM_VERSION)
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

  // Semver-shaped: alphanumerics, dots, dashes, dist-tag chars, range operators. Mirrors the regex used by
  // hb-service so the in-UI install path can't accept a version like "1.0; rm -rf /". On Windows the characters
  // cmd.exe acts on are refused as well, when npm is run (see RE_CMD_METACHARACTERS).
  @IsOptional()
  @IsString()
  @Matches(RE_NPM_VERSION)
  version?: string

  @IsOptional()
  @IsNumber()
  termCols?: number

  @IsOptional()
  @IsNotEmpty()
  termRows?: number
}
