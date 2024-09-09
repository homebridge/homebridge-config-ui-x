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
