-- DropForeignKey
ALTER TABLE "ApprovalDecision" DROP CONSTRAINT "ApprovalDecision_decidedByUserId_fkey";

-- AlterTable
ALTER TABLE "ApprovalDecision" ALTER COLUMN "decidedByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
