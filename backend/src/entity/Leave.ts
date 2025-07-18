import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { LeaveType } from "./LeaveType";
import { LeaveApproval } from "./LeaveApproval";

export enum LeaveStatus {
  Pending = "Pending", // Initial state for all new requests (if requires_approval)
  Pending_Manager_Approval = "Pending_Manager_Approval", // Explicitly awaiting manager
  Pending_HR_Approval = "Pending_HR_Approval", // Explicitly awaiting HR
  Awaiting_Admin_Approval = "Awaiting_Admin_Approval", // Already exists
  Approved = "Approved",
  Rejected = "Rejected",
  Cancelled = "Cancelled",
}

@Entity("leaves")
export class Leave {
  @PrimaryGeneratedColumn({ type: "int" })
  leave_id!: number;

  @Column({ type: "int" })
  user_id!: number;

  @Column({ type: "int" })
  type_id!: number;

  @Column({ type: "date" })
  start_date!: Date;

  @Column({ type: "date" })
  end_date!: Date;

  @Column({ type: "int", nullable: false })
  days_requested!: number;

  @Column({ type: "text" })
  reason!: string;

  @Column({ type: "enum", enum: LeaveStatus, default: LeaveStatus.Pending })
  status!: LeaveStatus;

  @Column({ type: "int", default: 1 })
  required_approvals!: number;

  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  applied_at!: Date;

  @Column({
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
  })
  updated_at!: Date;

  @Column({ nullable: true })
  processed_by_id!: number | null;

  @Column({ type: "timestamp", nullable: true })
  processed_at!: Date | null;

  @ManyToOne(() => User, (user) => user.leaves)
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.leaves)
  @JoinColumn({ name: "type_id" })
  leaveType!: LeaveType;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: "processed_by_id" })
  processedBy!: User | null; // Allow null for unprocessed leaves

  @OneToMany(() => LeaveApproval, (leaveApproval) => leaveApproval.leave)
  approvals!: LeaveApproval[];
}
