-- Learner profile for curriculum v2 (library hub plan, Phase 6): what a learner is studying, in the same shape
-- as Book Buddy's UserLearningGoal, the medium they study in, and the class node institutional students inherit.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "preferred_medium" VARCHAR(8),
ADD COLUMN "learning_path_skipped_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "classes" ADD COLUMN "curriculum_node_id" VARCHAR(36);

-- AlterTable
ALTER TABLE "streams" ADD COLUMN "combination_code" VARCHAR(60);

-- CreateTable
CREATE TABLE "learner_goals" (
    "user_id" VARCHAR(36) NOT NULL,
    "node_id" VARCHAR(36) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "combination_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learner_goals_pkey" PRIMARY KEY ("user_id","node_id")
);

-- CreateIndex
CREATE INDEX "learner_goals_node_id_idx" ON "learner_goals"("node_id");

-- AddForeignKey
ALTER TABLE "learner_goals" ADD CONSTRAINT "learner_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One main goal per learner (not expressible in the Prisma schema).
CREATE UNIQUE INDEX "learner_goals_one_primary_per_user" ON "learner_goals"("user_id") WHERE "is_primary";
