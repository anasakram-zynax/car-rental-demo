import { IsBoolean } from 'class-validator';

export class UpdateManualEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
