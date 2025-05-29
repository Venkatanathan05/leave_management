import { Worker, Job } from "bullmq";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { User } from "../entity/User";
import { LeaveType } from "../entity/LeaveType";

const connection = {
  host: "127.0.0.1",
  port: 6379,
};

interface BulkLeaveData {
  user_id: number;
  type_id: number;
  start_date: string; // ISO date string
  end_date: string; // ISO date string
  reason: string;
  required_approvals?: number;
}

export const bulkLeaveWorker = new Worker(
  "bulk-leave-queue",
  async (job: Job<BulkLeaveData[]>) => {
    const leavesData = job.data;

    const leaveRepo = AppDataSource.getRepository(Leave);
    const userRepo = AppDataSource.getRepository(User);
    const leaveTypeRepo = AppDataSource.getRepository(LeaveType);

    const leaveEntities: Leave[] = [];

    for (const data of leavesData) {
      // Fetch user and leaveType entities for relations
      const user = await userRepo.findOneBy({ user_id: data.user_id });
      const leaveType = await leaveTypeRepo.findOneBy({
        type_id: data.type_id,
      });

      if (!user) {
        console.error(`User not found: ${data.user_id}, skipping leave`);
        continue;
      }
      if (!leaveType) {
        console.error(`LeaveType not found: ${data.type_id}, skipping leave`);
        continue;
      }

      const leave = leaveRepo.create({
        user_id: data.user_id,
        user,
        type_id: data.type_id,
        leaveType,
        start_date: new Date(data.start_date),
        end_date: new Date(data.end_date),
        reason: data.reason,
        status: LeaveStatus.Pending,
        required_approvals: data.required_approvals ?? 1,
        processed_by_id: null,
        processed_at: null,
      });

      leaveEntities.push(leave);
    }

    if (leaveEntities.length) {
      await leaveRepo.save(leaveEntities);
      console.log(`Inserted ${leaveEntities.length} leave records`);
    } else {
      console.warn("No valid leave records to insert");
    }
  },
  { connection }
);

bulkLeaveWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

bulkLeaveWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});
