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
  'admin-guard',
  'session-extension',
  'profile-update',
] as const

export type RefreshTokenReason = (typeof REFRESH_TOKEN_REASONS)[number]

/**
 * How far a logout reaches. `everywhere` (the default) revokes every session
 * for the account; `local` signs out this browser only, and exists for logouts
 * the USER never asked for - the inactivity timer fires with a valid token, so
 * without this an idle tab left on one machine would end the user's active
 * sessions on every other device.
 */
export const LOGOUT_SCOPES = ['local', 'everywhere'] as const

export type LogoutScope = (typeof LOGOUT_SCOPES)[number]

export class LogoutDto {
  @IsOptional()
  @IsString()
  @IsIn(LOGOUT_SCOPES)
  @ApiProperty({ required: false, enum: LOGOUT_SCOPES })
  readonly scope?: LogoutScope
}

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
