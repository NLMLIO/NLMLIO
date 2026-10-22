import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from '../../common/security/access.guard';
import type { AuthenticatedRequest } from '../../common/security/access.guard';
import { toPublicUser } from '../../infra/database/user.repository';
import { UpdateProfileDto } from './dto/user.dto';
import { UserService } from './user.service';

@Controller('users/me')
@UseGuards(AccessGuard)
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  profile(@Req() request: AuthenticatedRequest) {
    return toPublicUser(request.account);
  }

  @Get('dashboard')
  dashboard(@Req() request: AuthenticatedRequest) {
    return this.users.dashboard(request.account);
  }

  @Patch()
  update(@Req() request: AuthenticatedRequest, @Body() input: UpdateProfileDto) {
    return this.users.updateProfile(request.account, input);
  }
}
