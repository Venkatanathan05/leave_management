import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { LEAVE_THRESHOLD_HR, LEAVE_THRESHOLD_ADMIN } from "../constants";
import { calculateWorkingDays } from "../utils/dateUtils";
import {
  getRequiredApprovals,
  checkApprovalStatus,
} from "../utils/approvalUtils";
import { In } from "typeorm";

export class HRController {
  async getUsers(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (userCredentials.role_id !== 5) {
      throw Boom.forbidden("Only HR can view users");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const users = await userRepository.find({
        where: { role_id: In([2, 3, 4]) },
        select: ["user_id", "name", "email", "role_id", "manager_id"],
        relations: ["role"],
      });

      return h
        .response(
          users.map((user) => ({
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_id: user.role_id,
            role_name: user.role.name,
            manager_id: user.manager_id,
          }))
        )
        .code(200);
    } catch (error) {
      console.error("Error fetching users for HR:", error);
      throw Boom.internal("Internal server error fetching users");
    }
  }

  async getUserLeaveInfo(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const userId = parseInt(request.params.user_id, 10);

    if (userCredentials.role_id !== 5) {
      throw Boom.forbidden("Only HR can view user leave info");
    }

    if (isNaN(userId)) {
      throw Boom.badRequest("Invalid user ID");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);

      const user = await userRepository.findOne({
        where: { user_id: userId, role_id: In([2, 3, 4]) },
      });
      if (!user) {
        throw Boom.notFound(
          "User not found or not a valid role for HR to view"
        );
      }

      const leaves = await leaveRepository.find({
        where: { user_id: userId },
        relations: ["leaveType", "approvals"],
        order: { applied_at: "DESC" },
      });

      const currentYear = new Date().getFullYear();
      const balances = await leaveBalanceRepository.find({
        where: { user_id: userId, year: currentYear },
        relations: ["leaveType"],
      });

      return h
        .response({
          user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_id: user.role_id,
          },
          leaves,
          balances,
        })
        .code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error fetching user leave info:", error);
      throw Boom.internal("Internal server error fetching leave info");
    }
  }

  async approveLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const leaveId = parseInt(request.params.leave_id, 10);
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const payload = request.payload as { comments?: string };

    if (userCredentials.role_id !== 5) {
      throw Boom.forbidden("Only HR can approve leaves");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveApprovalRepository =
        AppDataSource.getRepository(LeaveApproval);

      const leave = await leaveRepository.findOne({
        where: { leave_id: leaveId },
        relations: ["user", "leaveType", "approvals"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      const duration = calculateWorkingDays(
        new Date(leave.start_date),
        new Date(leave.end_date)
      );
      if (
        (leave.user.role_id === 2 || leave.user.role_id === 4) &&
        duration > 5
      ) {
        const managerApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 3 && a.action === ApprovalAction.Approved
        );
        if (!managerApproved) {
          throw Boom.badRequest("Manager approval required first");
        }
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: {
          leave_id: leaveId,
          approver_id: userCredentials.user_id,
          action: In([ApprovalAction.Approved, ApprovalAction.Rejected]),
        },
      });
      if (existingApproval) {
        throw Boom.conflict(
          `Leave already ${existingApproval.action.toLowerCase()} by you`
        );
      }

      const newApproval = new LeaveApproval();
      newApproval.leave_id = leave.leave_id;
      newApproval.approver_id = userCredentials.user_id;
      newApproval.approver_role_id = userCredentials.role_id;
      newApproval.action = ApprovalAction.Approved;
      newApproval.comments = payload.comments || "";
      newApproval.approved_at = new Date();
      console.log("New approval before insert:", newApproval);
      await leaveApprovalRepository.insert(newApproval);

      leave.approvals = leave.approvals || [];
      leave.approvals.push(newApproval);
      const { status, processed } = checkApprovalStatus(leave, leave.approvals);

      leave.status = status;
      await leaveRepository.save(leave);

      if (processed && status === LeaveStatus.Approved) {
        const leaveBalanceRepository =
          AppDataSource.getRepository(LeaveBalance);
        const balance = await leaveBalanceRepository.findOne({
          where: {
            user_id: leave.user_id,
            type_id: leave.type_id,
            year: new Date().getFullYear(),
          },
        });
        if (balance && leave.leaveType.is_balance_based) {
          balance.used_days += duration;
          balance.available_days = balance.total_days - balance.used_days;
          await leaveBalanceRepository.save(balance);
        }
      }

      return h
        .response({ message: `Leave ${status.toLowerCase()} successfully` })
        .code(200);
    } catch (error) {
      console.error("Error approving leave:", error);
      throw Boom.internal("Internal server error approving leave");
    }
  }

  async rejectLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const leaveId = parseInt(request.params.leave_id, 10);
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const payload = request.payload as { comments?: string };

    if (userCredentials.role_id !== 5) {
      throw Boom.forbidden("Only HR can reject leaves");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveApprovalRepository =
        AppDataSource.getRepository(LeaveApproval);

      const leave = await leaveRepository.findOne({
        where: { leave_id: leaveId },
        relations: ["user", "approvals"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      const duration = calculateWorkingDays(
        new Date(leave.start_date),
        new Date(leave.end_date)
      );
      if (
        (leave.user.role_id === 2 || leave.user.role_id === 4) &&
        duration > 5
      ) {
        const managerApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 3 && a.action === ApprovalAction.Approved
        );
        if (!managerApproved) {
          throw Boom.badRequest("Manager approval required first");
        }
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: {
          leave_id: leaveId,
          approver_id: userCredentials.user_id,
          action: In([ApprovalAction.Approved, ApprovalAction.Rejected]),
        },
      });
      if (existingApproval) {
        throw Boom.conflict(
          `Leave already ${existingApproval.action.toLowerCase()} by you`
        );
      }

      const newApproval = new LeaveApproval();
      newApproval.leave_id = leave.leave_id;
      newApproval.approver_id = userCredentials.user_id;
      newApproval.approver_role_id = userCredentials.role_id;
      newApproval.action = ApprovalAction.Rejected;
      newApproval.comments = payload.comments || "";
      newApproval.approved_at = new Date();
      console.log("New approval before insert:", newApproval);
      await leaveApprovalRepository.insert(newApproval);

      leave.status = LeaveStatus.Rejected;
      await leaveRepository.save(leave);

      return h.response({ message: "Leave rejected successfully" }).code(200);
    } catch (error) {
      console.error("Error rejecting leave:", error);
      throw Boom.internal("Internal server error rejecting leave");
    }
  }

  async getPendingLeaveRequests(
    request: Hapi.Request,
    h: Hapi.ResponseToolkit
  ) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (userCredentials.role_id !== 5) {
      throw Boom.forbidden("Only HR can view pending leave requests");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaves = await leaveRepository.find({
        where: {
          status: In([
            LeaveStatus.Pending,
            LeaveStatus.Awaiting_Admin_Approval,
          ]),
          user: { role_id: In([2, 3, 4]) },
        },
        relations: ["user", "leaveType", "approvals"],
        order: { applied_at: "ASC" },
      });

      const filteredLeaves = leaves.filter((leave) => {
        const duration = calculateWorkingDays(
          new Date(leave.start_date),
          new Date(leave.end_date)
        );
        return duration > LEAVE_THRESHOLD_HR || leave.required_approvals > 1;
      });

      return h.response(filteredLeaves).code(200);
    } catch (error) {
      console.error("Error fetching pending leave requests for HR:", error);
      throw Boom.internal(
        "Internal server error fetching pending leave requests"
      );
    }
  }
}
