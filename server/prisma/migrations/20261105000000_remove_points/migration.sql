/*
  Warnings:

  - 포인트 기능 제거(2026-11-05 결정). `User.point`, `User.pointReachedAt`, `GameResult.pointDelta` 값이 모두 삭제된다.

*/
-- DropIndex
DROP INDEX "User_point_pointReachedAt_createdAt_id_idx";

-- AlterTable
ALTER TABLE "GameResult" DROP COLUMN "pointDelta";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "point",
DROP COLUMN "pointReachedAt";

