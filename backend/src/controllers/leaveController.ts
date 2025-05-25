import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { calculateWorkingDays, checkLeaveOverlap } from "../utils/dateUtils";
import { getRequiredApprovals } from "../utils/approvalUtils";
import { roleInitialBalances } from "../constants";
import { User } from "../entity/User";
import { LeaveType } from "../entity/LeaveType";

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
      leave.required_approvals = getRequiredApprovals(leave);

      const savedLeave = await leaveRepository.save(leave);

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
        const duration = calculateWorkingDays(parsedStartDate, parsedEndDate);
        if (balance.available_days < duration) {
          await leaveRepository.delete(savedLeave.leave_id);
          throw Boom.forbidden("Insufficient leave balance");
        }
        balance.used_days += duration;
        balance.available_days = balance.total_days - balance.used_days;
        await leaveBalanceRepository.save(balance);
      }

      if (
        leave.required_approvals > 0 &&
        userCredentials.role_id !== 1 &&
        userCredentials.role_id !== 5
      ) {
        const leaveApprovalRepository =
          AppDataSource.getRepository(LeaveApproval);
        const manager = await AppDataSource.getRepository(User).findOne({
          where: { user_id: userCredentials.user_id },
          relations: ["manager"],
        });
        if (manager?.manager_id) {
          const approval = new LeaveApproval();
          approval.leave_id = savedLeave.leave_id;
          approval.approver_id = manager.manager_id;
          approval.approver_role_id = 3; // Manager role
          approval.action = ApprovalAction.Pending;
          approval.comments = "";
          await leaveApprovalRepository.save(approval);
        }
      }

      return h
        .response({ message: "Leave applied successfully", leave: savedLeave })
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
}
