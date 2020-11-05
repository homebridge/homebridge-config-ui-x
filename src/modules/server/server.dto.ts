import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class HomebridgeNetworkInterfacesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty()
  adapters: string[];
}