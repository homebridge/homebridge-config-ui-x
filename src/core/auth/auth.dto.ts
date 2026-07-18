import { ApiProperty } from '@nestjs/swagger'
import { IsDefined, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class AuthDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  readonly username: string

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ type: String })
  readonly password: string

  @IsString()
  @IsOptional()
  @ApiProperty({ required: false, type: String })
  readonly otp?: string
}

/** Client-supplied reason for POST /auth/refresh — used only for distinct log lines. */
export const REFRESH_TOKEN_REASONS = [
  'hb-session-bootstrap',
  'admin-guard',
  'session-extension',
  'profile-update',
] as const

export type RefreshTokenReason = (typeof REFRESH_TOKEN_REASONS)[number]

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @IsIn(REFRESH_TOKEN_REASONS)
  @ApiProperty({
    required: false,
    enum: REFRESH_TOKEN_REASONS,
    description: 'Why the client is refreshing; affects log wording only.',
  })
  readonly reason?: RefreshTokenReason
}
