import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDefined, IsString } from 'class-validator';

export class HomebridgeNetworkInterfacesDto {
  @IsArray()
  @IsString({ each: true })
  @ApiProperty()
  adapters: string[];
}

export class HomebridgeMdnsSettingDto {
  @IsBoolean()
  @IsDefined()
  @ApiProperty()
  legacyAdvertiser: boolean;
}
