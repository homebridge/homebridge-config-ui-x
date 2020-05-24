import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly username: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  readonly password: string;
}
