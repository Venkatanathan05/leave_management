import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Leave } from "../entity/Leave";
import { LeaveApproval } from "../entity/LeaveApproval";
import { LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { In } from "typeorm";
import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { LEAVE_THRESHOLD_ADMIN } from "../constants";

const userRepository = AppDataSource.getRepository(User);
const leaveRepository = AppDataSource.getRepository(Leave);
const leaveApprovalRepository = AppDataSource.getRepository(LeaveApproval);

export class HRController {
  async getUsers(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (user.role_id !== 5) {
      throw Boom.unauthorized("Only HR can view users");
    }

    try {
      const users = await userRepository
        .createQueryBuilder("user")
        .where("user.role_id IN (:...roleIds)", { roleIds: [2, 3, 4] }) // Managers, Employees, Interns
        .leftJoinAndSelect("user.role", "role")
        .leftJoinAndSelect("user.manager", "manager")
        .select([
          "user.user_id",
          "user.name",
          "user.email",
          "user.role_id",
          "role.name",
          "manager.user_id",
          "manager.name",
        ])
        .getMany();

      return h.response(users).code(200);
    } catch (error) {
      console.error("Error fetching users:", error);
      throw Boom.internal("Internal server error fetching users");
    }
  }

  async getUserLeaveInfo(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { user_id: targetUserId } = request.params;

    if (user.role_id !== 5) {
      throw Boom.unauthorized("Only HR can view leave info");
    }

    try {
      const targetUser = await userRepository.findOne({
        where: { user_id: parseInt(targetUserId), role_id: In([2, 3, 4]) },
      });

      if (!targetUser) {
        throw Boom.notFound("User not found or not accessible");
      }

      const leaves = await leaveRepository
        .createQueryBuilder("leave")
        .where("leave.user_id = :userId", { userId: targetUserId })
        .leftJoinAndSelect("leave.leaveType", "leaveType")
        .select([
          "leave.leave_id",
          "leave.start_date",
          "leave.end_date",
          "leave.reason",
          "leave.status",
          "leave.applied_at",
          "leaveType.type_id",
          "leaveType.name",
        ])
        .orderBy("leave.applied_at", "DESC")
        .getMany();

      const balances = await AppDataSource.getRepository(LeaveBalance)
        .createQueryBuilder("balance")
        .where("balance.user_id = :userId", { userId: targetUserId })
        .leftJoinAndSelect("balance.leaveType", "leaveType")
        .select([
          "balance.available_days",
          "leaveType.type_id",
          "leaveType.name",
        ])
        .getMany();

      return h.response({ leaves, balances }).code(200);
    } catch (error) {
      console.error("Error fetching user leave info:", error);
      throw Boom.internal("Internal server error fetching leave info");
    }
  }

  async approveLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_id } = request.params;
    const { comment } = request.payload as { comment?: string };

    if (user.role_id !== 5) {
      throw Boom.unauthorized("Only HR can approve leave requests");
    }

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id) },
        relations: ["user", "approvals"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      // Verify HR-level approval is required
      const managerApproval = leave.approvals.find(
        (a) => a.approver_role_id === 3
      );
      const requiresHR =
        leave.user.role_id === 3 || // Manager leaves
        (leave.user.role_id === 2 &&
          managerApproval?.status === LeaveStatus.Approved); // Employee leaves post-Manager

      if (!requiresHR) {
        throw Boom.forbidden("HR approval not required for this leave");
      }

      // Calculate leave duration
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const duration =
        Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)
        ) + 1;

      // Create approval record
      const approval = new LeaveApproval();
      approval.leave = leave;
      approval.approver_id = user.user_id;
      approval.approver_role_id = user.role_id;
      approval.status = LeaveStatus.Approved;
      approval.comments = comment || "Approved by HR";
      approval.approved_at = new Date();

      await leaveApprovalRepository.save(approval);

      // Update leave status
      leave.status =
        duration > LEAVE_THRESHOLD_ADMIN
          ? LeaveStatus.Pending
          : LeaveStatus.Approved;
      await leaveRepository.save(leave);

      return h.response({ message: "Leave request approved" }).code(200);
    } catch (error) {
      console.error("Error approving leave request:", error);
      throw Boom.internal("Internal server error approving leave request");
    }
  }

  async rejectLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_id } = request.params;
    const { comment } = request.payload as { comment?: string };

    if (user.role_id !== 5) {
      throw Boom.unauthorized("Only HR can reject leave requests");
    }

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id) },
        relations: ["user"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      // Create rejection record
      const approval = new LeaveApproval();
      approval.leave = leave;
      approval.approver_id = user.user_id;
      approval.approver_role_id = user.role_id;
      approval.status = LeaveStatus.Rejected;
      approval.comments = comment || "Rejected by HR";
      approval.approved_at = new Date();

      await leaveApprovalRepository.save(approval);

      // Update leave status
      leave.status = LeaveStatus.Rejected;
      await leaveRepository.save(leave);

      return h.response({ message: "Leave request rejected" }).code(200);
    } catch (error) {
      console.error("Error rejecting leave request:", error);
      throw Boom.internal("Internal server error rejecting leave request");
    }
  }

  async getPendingLeaveRequests(
    request: Hapi.Request,
    h: Hapi.ResponseToolkit
  ) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (user.role_id !== 5) {
      throw Boom.unauthorized("Only HR can view pending leave requests");
    }

    try {
      const pendingRequests = await leaveRepository
        .createQueryBuilder("leave")
        .where("leave.status = :status", { status: LeaveStatus.Pending })
        .andWhere(
          "leave.user_id IN (SELECT user_id FROM user WHERE role_id IN (:...roleIds))",
          {
            roleIds: [2, 3, 4], // Managers, Employees, Interns
          }
        )
        .leftJoinAndSelect("leave.user", "user")
        .leftJoinAndSelect("leave.leaveType", "leaveType")
        .leftJoinAndSelect("leave.approvals", "approvals")
        .select([
          "leave.leave_id",
          "leave.start_date",
          "leave.end_date",
          "leave.reason",
          "leave.status",
          "leave.applied_at",
          "user.user_id",
          "user.name",
          "user.role_id",
          "leaveType.type_id",
          "leaveType.name",
          "approvals.approver_role_id",
          "approvals.status",
        ])
        .orderBy("leave.applied_at", "ASC")
        .getMany();

      // Filter for HR-relevant requests (Manager leaves or Employee leaves post-Manager)
      const hrRequests = pendingRequests.filter((leave) => {
        const managerApproval = leave.approvals.find(
          (a) => a.approver_role_id === 3
        );
        return (
          leave.user.role_id === 3 || // Manager leaves
          (leave.user.role_id === 2 &&
            managerApproval?.status === LeaveStatus.Approved) // Employee leaves post-Manager
        );
      });

      return h.response(hrRequests).code(200);
    } catch (error) {
      console.error("Error fetching pending leave requests:", error);
      throw Boom.internal(
        "Internal server error fetching pending leave requests"
      );
    }
  }
}
