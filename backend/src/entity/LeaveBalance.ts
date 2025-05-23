import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { LeaveType } from "./LeaveType";

@Entity("leave_balances")
export class LeaveBalance {
  @PrimaryGeneratedColumn({ type: "int" })
  balance_id!: number;

  @Column({ type: "int" })
  user_id!: number;

  @Column({ type: "int" })
  type_id!: number;

  @Column({ type: "int" })
  year!: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  total_days!: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.0 })
  used_days!: number;

  @Column({ type: "decimal", precision: 10, scale: 2, default: 0.0 })
  available_days!: number;

  @ManyToOne(() => User, (user) => user.leaveBalances)
  @JoinColumn({ name: "user_id" })
  user!: User;

  @ManyToOne(() => LeaveType, (leaveType) => leaveType.leaveBalances)
  @JoinColumn({ name: "type_id" })
  leaveType!: LeaveType;
}
