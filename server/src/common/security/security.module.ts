import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AccessGuard } from './access.guard';
import { SessionService } from './session.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [PasswordService, TokenService, AccessGuard, SessionService],
  exports: [PasswordService, TokenService, AccessGuard, SessionService],
})
export class SecurityModule {}
