import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AccessGuard } from '../../common/security/access.guard';
import type { AuthenticatedRequest } from '../../common/security/access.guard';
import { PageQuery } from '../user/dto/user.dto';
import { RankingService } from './ranking.service';

@Controller()
@UseGuards(AccessGuard)
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('users/me/history')
  history(@Req() request: AuthenticatedRequest, @Query() query: PageQuery) {
    return this.rankingService.history(request.account.id, query.page, query.pageSize);
  }

  @Get('ranking')
  ranking(@Req() request: AuthenticatedRequest, @Query() query: PageQuery) {
    return this.rankingService.ranking(request.account, query.page, query.pageSize);
  }
}
