import { ApiProperty } from '@nestjs/swagger'
import { IsBoolean, IsDefined, IsString, ValidateIf } from 'class-validator'

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
