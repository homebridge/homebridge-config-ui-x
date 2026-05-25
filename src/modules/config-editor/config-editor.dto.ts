import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsDefined, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator'

export class SetBridgeAlertDto {
  @ApiProperty({
    type: Boolean,
    description: 'Whether to hide the alert for this bridge',
    example: true,
  })
  @IsDefined()
  @IsBoolean()
  value: boolean
}

export class SetScheduledRestartCronDto {
  @ApiProperty({
    type: String,
    description: 'Cron expression for scheduled restart (or `null` to disable).',
    example: '0 5 * * *',
    required: false,
    nullable: true,
  })
  @ValidateIf(o => o.value !== null)
  @IsString()
  value: string | null
}

export class PortRangeDto {
  @ApiProperty({
    type: Number,
    description: 'Range start (inclusive). Must be a port number between 1025 and 65533.',
    required: false,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1025)
  @Max(65533)
  @IsOptional()
  start?: number | null

  @ApiProperty({
    type: Number,
    description: 'Range end (inclusive). Must be a port number between 1025 and 65533.',
    required: false,
    nullable: true,
  })
  @ValidateIf((_o, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(1025)
  @Max(65533)
  @IsOptional()
  end?: number | null
}
