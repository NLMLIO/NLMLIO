import { Module } from '@nestjs/common';
import { SecurityModule } from '../../common/security/security.module';
import { UserModule } from '../user/user.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [SecurityModule, UserModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}
