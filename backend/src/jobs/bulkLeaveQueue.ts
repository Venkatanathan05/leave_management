import { Queue } from "bullmq";
import redis from "../config/redis";

export const bulkLeaveQueue = new Queue("bulk-leave-queue", {
  connection: redis.duplicate(),
});
