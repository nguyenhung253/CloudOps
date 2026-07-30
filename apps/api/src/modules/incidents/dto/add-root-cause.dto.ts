import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AddRootCauseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  rootCause!: string;
}
