import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsString()
  @MaxLength(100)
  name: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}