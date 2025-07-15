import { DataSource } from "typeorm";
import { User } from "./entity/User";
import { Role } from "./entity/Role";
import { Leave } from "./entity/Leave";
import { LeaveType } from "./entity/LeaveType";
import { LeaveBalance } from "./entity/LeaveBalance";
import { LeaveApproval } from "./entity/LeaveApproval";
import * as dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "venkat@123",
  database: process.env.DB_NAME || "leave_management",
  synchronize: true,
  logging: false,
  entities: [User, Role, Leave, LeaveType, LeaveBalance, LeaveApproval],
  migrations: [],
  subscribers: [],
});
