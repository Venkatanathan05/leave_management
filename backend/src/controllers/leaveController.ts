import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { calculateWorkingDays, checkLeaveOverlap } from "../utils/dateUtils";
import { getRequiredApprovals } from "../utils/approvalUtils";
import { HOLIDAYS_2025, roleInitialBalances } from "../constants";
import { User } from "../entity/User";
import { LeaveType } from "../entity/LeaveType";
import { LessThanOrEqual, MoreThanOrEqual, In } from "typeorm";

export class LeaveController {
  async applyLeave(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { type_id, start_date, end_date, reason } = request.payload as {
      type_id: number;
      start_date: string | number;
      end_date: string | number;
      reason: string;
    };

    if (!type_id || !start_date || !end_date || !reason) {
      throw Boom.badRequest("Missing required fields");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveTypeRepository = AppDataSource.getRepository(LeaveType);
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);
      const userRepository = AppDataSource.getRepository(User);

      const leaveType = await leaveTypeRepository.findOne({
        where: { type_id },
      });
      if (!leaveType) {
        throw Boom.badRequest("Invalid leave type");
      }

      const parsedStartDate = new Date(start_date);
      const parsedEndDate = new Date(end_date);
      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        throw Boom.badRequest("Invalid date format");
      }
      if (parsedStartDate > parsedEndDate) {
        throw Boom.badRequest("Start date must be before end date");
      }

      const existingLeaves = await leaveRepository.find({
        where: { user_id: userCredentials.user_id },
        select: ["start_date", "end_date", "status"],
      });
      const overlapResult = checkLeaveOverlap(
        parsedStartDate,
        parsedEndDate,
        existingLeaves
      );
      if (overlapResult.overlaps) {
        const conflictingLeave = overlapResult.conflictingLeave;
        throw Boom.conflict(
          `Leave overlaps with existing leave from ${new Date(
            conflictingLeave.start_date
          ).toISOString()} to ${new Date(
            conflictingLeave.end_date
          ).toISOString()}`
        );
      }

      const user = await userRepository.findOne({
        where: { user_id: userCredentials.user_id },
        relations: ["role"],
      });
      if (!user) {
        throw Boom.notFound("User not found");
      }

      const leave = new Leave();
      leave.user_id = userCredentials.user_id;
      leave.type_id = type_id;
      leave.start_date = parsedStartDate;
      leave.end_date = parsedEndDate;
      leave.reason = reason;
      leave.applied_at = new Date();
      leave.status = leaveType.requires_approval
        ? LeaveStatus.Pending
        : LeaveStatus.Approved;
      leave.user = user;
      leave.required_approvals = getRequiredApprovals(leave);

      const duration = calculateWorkingDays(parsedStartDate, parsedEndDate);
      const savedLeave = await leaveRepository.save(leave);

      if (leaveType.requires_approval && userCredentials.role_id !== 1) {
        const leaveApprovalRepository =
          AppDataSource.getRepository(LeaveApproval);
        if (userCredentials.role_id === 2 || userCredentials.role_id === 4) {
          // Employee/Intern
          if (duration <= 2) {
            if (user.manager_id) {
              const manager = await userRepository.findOne({
                where: { user_id: user.manager_id, role_id: 3 },
              });
              if (manager) {
                const approval = new LeaveApproval();
                approval.leave_id = savedLeave.leave_id;
                approval.approver_id = manager.user_id;
                approval.approver_role_id = 3;
                approval.action = ApprovalAction.Pending;
                await leaveApprovalRepository.save(approval);
              }
            }
          } else {
            const hr = await userRepository.findOne({ where: { role_id: 5 } });
            if (hr) {
              const approval = new LeaveApproval();
              approval.leave_id = savedLeave.leave_id;
              approval.approver_id = hr.user_id;
              approval.approver_role_id = 5;
              approval.action = ApprovalAction.Pending;
              await leaveApprovalRepository.save(approval);
            }
            if (duration > 5 && user.manager_id) {
              const manager = await userRepository.findOne({
                where: { user_id: user.manager_id, role_id: 3 },
              });
              if (manager) {
                const approval = new LeaveApproval();
                approval.leave_id = savedLeave.leave_id;
                approval.approver_id = manager.user_id;
                approval.approver_role_id = 3;
                approval.action = ApprovalAction.Pending;
                await leaveApprovalRepository.save(approval);
              }
            }
          }
        } else if (userCredentials.role_id === 3) {
          // Manager
          const hr = await userRepository.findOne({ where: { role_id: 5 } });
          if (hr) {
            const approval = new LeaveApproval();
            approval.leave_id = savedLeave.leave_id;
            approval.approver_id = hr.user_id;
            approval.approver_role_id = 5;
            approval.action = ApprovalAction.Pending;
            await leaveApprovalRepository.save(approval);
          }
          if (duration > 5) {
            const admin = await userRepository.findOne({
              where: { role_id: 1 },
            });
            if (admin) {
              const approval = new LeaveApproval();
              approval.leave_id = savedLeave.leave_id;
              approval.approver_id = admin.user_id;
              approval.approver_role_id = 1;
              approval.action = ApprovalAction.Pending;
              await leaveApprovalRepository.save(approval);
            }
          }
        } else if (userCredentials.role_id === 5) {
          // HR
          const admin = await userRepository.findOne({ where: { role_id: 1 } });
          if (admin) {
            const approval = new LeaveApproval();
            approval.leave_id = savedLeave.leave_id;
            approval.approver_id = admin.user_id;
            approval.approver_role_id = 1;
            approval.action = ApprovalAction.Pending;
            await leaveApprovalRepository.save(approval);
          }
        }
      }

      if (!leaveType.is_balance_based) {
        return h
          .response({
            message: "Leave applied successfully",
            leave: savedLeave,
          })
          .code(201);
      }

      const currentYear = new Date().getFullYear();
      let balance = await leaveBalanceRepository.findOne({
        where: { user_id: userCredentials.user_id, type_id, year: currentYear },
      });
      if (!balance) {
        const initialBalance = roleInitialBalances[
          userCredentials.role_id
        ]?.find((rule) => rule.leaveTypeName === leaveType.name);
        if (!initialBalance) {
          throw Boom.forbidden("No balance available for this leave type");
        }
        balance = new LeaveBalance();
        balance.user_id = userCredentials.user_id;
        balance.type_id = type_id;
        balance.year = currentYear;
        balance.total_days = initialBalance.initialDays;
        balance.used_days = 0;
        balance.available_days = initialBalance.initialDays;
      }

      if (leave.status === LeaveStatus.Approved) {
        if (balance.available_days < duration) {
          await leaveRepository.delete(savedLeave.leave_id);
          throw Boom.forbidden("Insufficient leave balance");
        }
        balance.used_days += duration;
        balance.available_days = balance.total_days - balance.used_days;
        await leaveBalanceRepository.save(balance);
      }

      return h
        .response({
          message: "Leave applied successfully",
          leave: savedLeave,
        })
        .code(201);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error applying leave:", error);
      throw Boom.internal("Internal server error applying leave");
    }
  }

  async cancelLeave(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const leaveId = parseInt(request.params.id, 10);
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (isNaN(leaveId)) {
      throw Boom.badRequest("Invalid leave ID");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);

      const leave = await leaveRepository.findOne({
        where: { leave_id: leaveId, user_id: userCredentials.user_id },
        relations: ["leaveType"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      if (
        leave.status !== LeaveStatus.Pending &&
        leave.status !== LeaveStatus.Approved
      ) {
        throw Boom.forbidden(
          "Cannot cancel a leave that is not pending or approved"
        );
      }

      const duration = calculateWorkingDays(
        new Date(leave.start_date),
        new Date(leave.end_date)
      );
      if (
        leave.status === LeaveStatus.Approved &&
        leave.leaveType.is_balance_based
      ) {
        const balance = await leaveBalanceRepository.findOne({
          where: {
            user_id: userCredentials.user_id,
            type_id: leave.type_id,
            year: new Date().getFullYear(),
          },
        });
        if (balance) {
          balance.used_days -= duration;
          balance.available_days = balance.total_days - balance.used_days;
          await leaveBalanceRepository.save(balance);
        }
      }

      await leaveRepository.delete(leaveId);
      return h.response({ message: "Leave cancelled successfully" }).code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error cancelling leave:", error);
      throw Boom.internal("Internal server error cancelling leave");
    }
  }

  async getLeaveHistory(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as { user_id: number };
    if (!user.user_id) {
      throw Boom.unauthorized("User not authenticated or user ID missing");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaves = await leaveRepository.find({
        where: { user_id: user.user_id },
        relations: ["leaveType", "approvals"],
        order: { applied_at: "DESC" },
      });
      return h.response(leaves).code(200);
    } catch (error) {
      console.error("Error fetching leave history:", error);
      throw Boom.internal("Internal server error fetching leave history");
    }
  }

  async getCalendarData(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { period = "month", date = new Date().toISOString() } =
      request.query as {
        period?: "week" | "month";
        date?: string;
      };

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const userRepository = AppDataSource.getRepository(User);
      const startDate = new Date(date);
      let endDate: Date;
      if (period === "month") {
        startDate.setDate(1);
        endDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + 1,
          0
        );
      } else {
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
      }

      let leaves: Leave[] = [];
      let users: User[] = [];
      if (userCredentials.role_id === 1) {
        // Admin: All users
        leaves = await leaveRepository.find({
          where: {
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
          },
          relations: ["user", "leaveType"],
        });
        users = await userRepository.find();
      } else if (userCredentials.role_id === 5) {
        // HR: Managers, Employees, Interns
        leaves = await leaveRepository.find({
          where: {
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
            user: { role_id: In([2, 3, 4]) },
          },
          relations: ["user", "leaveType"],
        });
        users = await userRepository.find({
          where: { role_id: In([2, 3, 4]) },
        });
      } else if (userCredentials.role_id === 3) {
        // Manager: Team + own leaves
        const team = await userRepository.find({
          where: { manager_id: userCredentials.user_id, role_id: In([2, 4]) },
        });
        const teamIds = team.map((u) => u.user_id);
        leaves = await leaveRepository.find({
          where: [
            { user_id: userCredentials.user_id, status: LeaveStatus.Approved },
            { user_id: In(teamIds), status: LeaveStatus.Approved },
          ],
          relations: ["user", "leaveType"],
        });
        const currentUser = await userRepository.findOne({
          where: { user_id: userCredentials.user_id },
        });
        if (currentUser) {
          users = [...team, currentUser];
        }
      } else {
        // Employee/Intern: Own leaves
        leaves = await leaveRepository.find({
          where: {
            user_id: userCredentials.user_id,
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
          },
          relations: ["user", "leaveType"],
        });
        const currentUser = await userRepository.findOne({
          where: { user_id: userCredentials.user_id },
        });
        if (currentUser) {
          users = [currentUser];
        }
      }

      const totalUsers = users.length;
      const calendarData = [];
      for (
        let d = new Date(startDate);
        d <= endDate;
        d.setDate(d.getDate() + 1)
      ) {
        const date = new Date(d);
        const onLeave = leaves.filter((l) => {
          const start = new Date(l.start_date);
          const end = new Date(l.end_date);
          return date >= start && date <= end;
        });
        const leaveCount = onLeave.length;
        const presentCount = totalUsers - leaveCount;
        calendarData.push({
          date: date.toISOString(),
          leaves: onLeave.map((l) => ({
            leave_id: l.leave_id,
            user_id: l.user.user_id,
            user_name: l.user.name,
            leave_type: l.leaveType.name,
          })),
          counts: { leave: leaveCount, present: presentCount },
        });
      }

      return h
        .response({
          period,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          data: calendarData,
        })
        .code(200);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
      throw Boom.internal("Internal server error fetching calendar data");
    }
  }

  async getHolidays(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    try {
      return h.response(HOLIDAYS_2025).code(200);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      throw Boom.internal("Internal server error fetching holidays");
    }
  }
}
