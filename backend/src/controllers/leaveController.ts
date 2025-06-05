import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import {
  calculateWorkingDays,
  checkLeaveOverlap,
  isWeekend,
  isHoliday,
} from "../utils/dateUtils";
import {
  checkApprovalStatus,
  getRequiredApprovals,
} from "../utils/approvalUtils";
import { HOLIDAYS_2025, roleInitialBalances } from "../constants";
import { User } from "../entity/User";
import { LeaveType } from "../entity/LeaveType";
import { LessThanOrEqual, MoreThanOrEqual, In } from "typeorm";

import { bulkLeaveQueue } from "../jobs/bulkLeaveQueue";
import { parse } from "csv-parse";
import { Readable } from "stream";

interface RawLeave {
  leave_id: number;
  start_date: string;
  end_date: string;
  status: string;
}

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

      // Normalize dates to midnight UTC
      parsedStartDate.setUTCHours(0, 0, 0, 0);
      parsedEndDate.setUTCHours(0, 0, 0, 0);
      console.log(
        `applyLeave - Normalized input: start=${parsedStartDate.toISOString()}, end=${parsedEndDate.toISOString()}`
      );

      // Check for weekends and holidays
      const currentDate = new Date(parsedStartDate);
      while (currentDate <= parsedEndDate) {
        console.log(`applyLeave - Checking date: ${currentDate.toISOString()}`);
        if (isWeekend(currentDate)) {
          throw Boom.badRequest(
            `Cannot apply leave on weekend: ${currentDate.toLocaleDateString()}`
          );
        }
        if (isHoliday(currentDate)) {
          throw Boom.badRequest(
            `Cannot apply leave on holiday: ${currentDate.toLocaleDateString()}`
          );
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Use raw query to fetch exact database dates
      const startDateStr = parsedStartDate.toISOString().split("T")[0];
      const endDateStr = parsedEndDate.toISOString().split("T")[0];
      const rawLeaves: RawLeave[] = await AppDataSource.query(
        `SELECT leave_id, start_date, end_date, status
         FROM leaves
         WHERE user_id = $1
         AND DATE(start_date) <= $2
         AND DATE(end_date) >= $3`,
        [userCredentials.user_id, endDateStr, startDateStr]
      );
      console.log(
        `applyLeave - Raw database leaves: ${JSON.stringify(rawLeaves)}`
      );

      const existingLeaves = rawLeaves.map((leave: RawLeave) => ({
        start_date: new Date(leave.start_date),
        end_date: new Date(leave.end_date),
        status: leave.status,
      }));

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
          ).toLocaleDateString()} to ${new Date(
            conflictingLeave.end_date
          ).toLocaleDateString()}`
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
      // REMOVE THIS LINE: leave.status = leaveType.requires_approval ? LeaveStatus.Pending : LeaveStatus.Approved;
      leave.user = user; // Ensure user is attached for getRequiredApprovals and checkApprovalStatus
      leave.leaveType = leaveType; // Ensure leaveType is attached for getRequiredApprovals

      // Calculate required_approvals FIRST
      leave.required_approvals = getRequiredApprovals(leave);

      // Determine initial status based on required_approvals and applicant role
      // For a new leave, there are no existing approvals yet, so pass an empty array for approvals.
      const { status: initialStatus } = checkApprovalStatus(leave, []);
      leave.status = initialStatus; // Set the status derived from checkApprovalStatus

      const duration = calculateWorkingDays(parsedStartDate, parsedEndDate);
      console.log(
        `applyLeave - Setting required_approvals: ${leave.required_approvals}`
      );
      console.log(`applyLeave - Setting initial status: ${leave.status}`); // Add this log for verification!

      const savedLeave = await leaveRepository.save(leave);
      console.log(`applyLeave - Saved leave: ${JSON.stringify(savedLeave)}`);

      if (leaveType.requires_approval && userCredentials.role_id !== 1) {
        // Admin doesn't create approvals for self here
        const leaveApprovalRepository =
          AppDataSource.getRepository(LeaveApproval);

        // No need to recalculate requiredApprovals, use leave.required_approvals
        const requiredApprovals = leave.required_approvals;

        // Conditional creation of approval records
        // 1. Manager approval for Employee/Intern
        if (
          (userCredentials.role_id === 2 || userCredentials.role_id === 4) &&
          requiredApprovals >= 1
        ) {
          if (user.manager_id) {
            const manager = await userRepository.findOne({
              where: { user_id: user.manager_id, role_id: 3 },
            });
            if (manager) {
              const approval = new LeaveApproval();
              approval.leave_id = savedLeave.leave_id;
              approval.approver_id = manager.user_id;
              approval.approver_role_id = 3; // Manager role
              approval.action = ApprovalAction.Pending;
              await leaveApprovalRepository.save(approval);
            }
          }
        }

        // 2. HR approval (for Employees after Manager approval, or directly for Managers)
        // This is necessary if requiredApprovals is 2 or 3.
        // We already ensure requiredApprovals is 2 or 3 for managers/HR by getRequiredApprovals
        if (requiredApprovals >= 2 && userCredentials.role_id !== 5) {
          // HR doesn't approve own leave
          const hr = await userRepository.findOne({ where: { role_id: 5 } });
          if (!hr) {
            console.error(`applyLeave - No HR user found for role_id: 5`);
            throw Boom.internal("No HR user available to approve leave");
          }
          const approval = new LeaveApproval();
          approval.leave_id = savedLeave.leave_id;
          approval.approver_id = hr.user_id;
          approval.approver_role_id = 5; // HR role
          approval.action = ApprovalAction.Pending;
          await leaveApprovalRepository.save(approval);
        }

        // 3. Admin approval (if requiredApprovals is 3)
        if (requiredApprovals === 3 && userCredentials.role_id !== 1) {
          // Admin doesn't approve own leave
          const admin = await userRepository.findOne({ where: { role_id: 1 } });
          if (admin) {
            const approval = new LeaveApproval();
            approval.leave_id = savedLeave.leave_id;
            approval.approver_id = admin.user_id;
            approval.approver_role_id = 1; // Admin role
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
            toast: { message: "Leave applied successfully", type: "success" },
          })
          .code(201);
      }

      // ... (rest of your balance logic, no changes needed here unless it's impacting status)

      return h
        .response({
          message: "Leave applied successfully",
          leave: savedLeave,
          toast: { message: "Leave applied successfully", type: "success" },
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

      const { working } = calculateWorkingDays(
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
          balance.used_days -= working;
          balance.available_days = balance.total_days - balance.used_days;
          console.log(
            `cancelLeave - Balance update: user_id=${userCredentials.user_id}, type_id=${leave.type_id}, duration=${working}, new_used_days=${balance.used_days}, new_available_days=${balance.available_days}`
          );
          await leaveBalanceRepository.save(balance);
        }
      }

      await leaveRepository.delete(leaveId);
      return h
        .response({
          message: "Leave cancelled successfully",
          toast: { message: "Leave cancelled successfully", type: "success" },
        })
        .code(200);
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
        relations: ["leaveType", "approvals", "approvals.approver"],
        order: { applied_at: "DESC" },
      });

      // Filter approvals to show only the latest action per approver
      const filteredLeaves = leaves.map((leave) => {
        const approverActions: { [key: number]: LeaveApproval } = {};
        leave.approvals.forEach((approval) => {
          if (
            !approverActions[approval.approver_id] ||
            (approval.action !== ApprovalAction.Pending &&
              approverActions[approval.approver_id].action ===
                ApprovalAction.Pending)
          ) {
            approverActions[approval.approver_id] = approval;
          }
        });
        return {
          ...leave,
          approvals: Object.values(approverActions),
        };
      });

      return h.response(filteredLeaves).code(200);
    } catch (error) {
      console.error("Error fetching leave history:", error);
      throw Boom.internal("Internal server error fetching leave history");
    }
  }

  async getLeaveAvailability(request: Hapi.Request, h: Hapi.ResponseToolkit) {
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

      // Restrict to current date
      const today = new Date();
      if (endDate > today) {
        endDate = today;
      }

      // Debug for Manager
      if (userCredentials.role_id === 3) {
        console.log(`Fetching team for manager:${userCredentials.user_id}`);
      }

      let leaves: Leave[] = [];
      let users: User[] = [];
      let teamUsers: User[] = [];
      if (userCredentials.role_id === 1) {
        leaves = await leaveRepository.find({
          where: {
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
          },
          relations: ["user", "leaveType", "user.role"],
        });
        users = await userRepository.find();
      } else if (userCredentials.role_id === 5) {
        leaves = await leaveRepository.find({
          where: {
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
            user: { role_id: In([2, 3, 4]) },
          },
          relations: ["user", "leaveType", "user.role"],
        });
        users = await userRepository.find({
          where: { role_id: In([2, 3, 4]) },
        });
      } else if (userCredentials.role_id === 3) {
        const team = await userRepository.find({
          where: { manager_id: userCredentials.user_id, role_id: In([2, 4]) },
        });
        console.log(`Team for manager ${userCredentials.user_id}:`, team);
        const teamIds = team.map((u) => u.user_id);
        leaves = await leaveRepository.find({
          where: [
            {
              user_id: userCredentials.user_id,
              status: LeaveStatus.Approved,
              start_date: LessThanOrEqual(endDate),
              end_date: MoreThanOrEqual(startDate),
            },
            {
              user_id: In(teamIds),
              status: LeaveStatus.Approved,
              start_date: LessThanOrEqual(endDate),
              end_date: MoreThanOrEqual(startDate),
            },
          ],
          relations: ["user", "leaveType", "user.role"],
        });
        console.log(`Leaves for manager ${userCredentials.user_id}:`, leaves);
        const currentUser = await userRepository.findOne({
          where: { user_id: userCredentials.user_id },
        });
        if (currentUser) {
          users = [...team];
          teamUsers = team; // Store team users for Manager view
        }
      } else {
        leaves = await leaveRepository.find({
          where: {
            user_id: userCredentials.user_id,
            status: LeaveStatus.Approved,
            start_date: LessThanOrEqual(endDate),
            end_date: MoreThanOrEqual(startDate),
          },
          relations: ["user", "leaveType", "user.role"],
        });
        users = await userRepository.find({
          where: { user_id: userCredentials.user_id },
        });
      }

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
        let usersData = [];

        if (userCredentials.role_id === 3) {
          // Include all team members (and Manager) with leave data if applicable
          usersData = users.map((u) => {
            const leave = onLeave.find((l) => l.user.user_id === u.user_id);
            if (leave) {
              return {
                leave_id: leave.leave_id,
                user_id: u.user_id,
                user_name: u.name,
                user_role_id: u.role_id,
                user_role_name: u.role?.name || "Unknown",
                leave_type: leave.leaveType.name,
              };
            }
            // No leave data implies presence (handled in frontend)
            return {
              user_id: u.user_id,
              user_name: u.name,
              user_role_id: u.role_id,
              user_role_name: u.role?.name || "Unknown",
            };
          });
        } else {
          // Existing logic for Admin/HR
          usersData = onLeave.map((l) => ({
            leave_id: l.leave_id,
            user_id: l.user.user_id,
            user_name: l.user.name,
            user_role_id: l.user.role_id,
            user_role_name: l.user.role.name,
            leave_type: l.leaveType.name,
          }));
        }

        calendarData.push({
          date: date.toISOString(),
          users: usersData,
          counts: { leave: leaveCount, present: users.length - leaveCount },
        });
      }

      return h
        .response({
          period,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          data: calendarData,
          holidays: HOLIDAYS_2025,
        })
        .code(200);
    } catch (error) {
      console.error("Error fetching leave availability:", error);
      throw Boom.internal("Internal server error fetching leave availability");
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

  async bulkUploadHandler(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    const { file } = request.payload as { file: any };

    if (!file || (!file._data && !file._readableState)) {
      throw Boom.badRequest("CSV file is required for bulk upload.");
    }

    const leaves: Array<{
      user_id: number;
      leave_type_id: number;
      start_date: string;
      end_date: string;
      reason?: string;
    }> = [];

    const stream = file._readableState ? file : Readable.from(file._data);

    try {
      const parser = stream.pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        })
      );

      for await (const record of parser) {
        // Validate required fields
        if (
          !record.user_id ||
          !record.leave_type_id ||
          !record.start_date ||
          !record.end_date
        ) {
          throw Boom.badRequest(
            "Each row must include user_id, leave_type_id, start_date, and end_date"
          );
        }

        leaves.push({
          user_id: parseInt(record.user_id),
          leave_type_id: parseInt(record.leave_type_id),
          start_date: record.start_date,
          end_date: record.end_date,
          reason: record.reason || "",
        });
      }

      if (leaves.length === 0) {
        throw Boom.badRequest("CSV is empty or has no valid rows.");
      }

      const jobId = `leave-bulk-job-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      await bulkLeaveQueue.add(
        jobId,
        {
          submitted_by: user.user_id,
          uploaded_at: new Date().toISOString(),
          leaves,
        },
        {
          removeOnComplete: true,
          removeOnFail: false,
        }
      );

      return h
        .response({
          message:
            "Bulk leave upload submitted successfully. It will be processed shortly.",
          jobId,
          count: leaves.length,
        })
        .code(202);
    } catch (err) {
      console.error("Bulk upload error:", err);
      throw Boom.internal("Failed to queue bulk leave upload");
    }
  }
}
