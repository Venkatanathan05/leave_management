import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { User } from "../entity/User";
import { LeaveBalance } from "../entity/LeaveBalance";
import { calculateWorkingDays } from "../utils/dateUtils";
import { checkApprovalStatus } from "../utils/approvalUtils";
import { In, LessThanOrEqual, MoreThanOrEqual } from "typeorm";

export class ManagerController {
  async getUsers(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (userCredentials.role_id !== 3) {
      throw Boom.forbidden("Only Managers can view team users");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const users = await userRepository.find({
        where: { manager_id: userCredentials.user_id, role_id: In([2, 4]) }, // Employees, Interns
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
      console.error("Error fetching team users:", error);
      throw Boom.internal("Internal server error fetching team users");
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

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      let leaves: Leave[] = [];

      if (userCredentials.role_id === 1) {
        leaves = await leaveRepository.find({
          where: {
            status: In([
              LeaveStatus.Pending,
              LeaveStatus.Awaiting_Admin_Approval,
            ]),
          },
          relations: ["user", "leaveType", "approvals"],
          order: { applied_at: "ASC" },
        });
      } else if (userCredentials.role_id === 3) {
        leaves = await leaveRepository
          .createQueryBuilder("leave")
          .leftJoinAndSelect("leave.user", "user")
          .leftJoinAndSelect("leave.leaveType", "leaveType")
          .leftJoinAndSelect("leave.approvals", "approvals")
          .where("leave.status = :pending", { pending: LeaveStatus.Pending })
          .andWhere("user.manager_id = :managerId", {
            managerId: userCredentials.user_id,
          })
          .orderBy("leave.applied_at", "ASC")
          .getMany();
      } else {
        throw Boom.forbidden(
          "Only Managers or Admins can view pending leave requests"
        );
      }

      return h.response(leaves).code(200);
    } catch (error) {
      console.error("Error fetching pending leave requests:", error);
      throw Boom.internal(
        "Internal server error fetching pending leave requests"
      );
    }
  }

  async approveLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const leaveId = parseInt(request.params.leave_id, 10);
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const payload = request.payload as { comments?: string };

    if (userCredentials.role_id !== 3) {
      throw Boom.forbidden("Only Managers can approve leaves");
    }

    if (isNaN(leaveId)) {
      throw Boom.badRequest("Invalid leave ID");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveApprovalRepository =
        AppDataSource.getRepository(LeaveApproval);

      const leave = await leaveRepository.findOne({
        where: { leave_id: leaveId, status: LeaveStatus.Pending },
        relations: ["user", "leaveType", "approvals"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found or not pending");
      }

      if (leave.user.manager_id !== userCredentials.user_id) {
        throw Boom.forbidden("You are not the manager for this employee");
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: { leave_id: leaveId, approver_id: userCredentials.user_id },
      });
      if (
        existingApproval &&
        existingApproval.action === ApprovalAction.Approved
      ) {
        throw Boom.conflict("Leave already approved by you");
      }

      const newApproval = new LeaveApproval();
      newApproval.leave_id = leaveId;
      newApproval.approver_id = userCredentials.user_id;
      newApproval.approver_role_id = userCredentials.role_id;
      newApproval.action = ApprovalAction.Approved;
      newApproval.comments = payload.comments || "";
      newApproval.approved_at = new Date();

      await leaveApprovalRepository.save(newApproval);

      const updatedApprovals = [...leave.approvals, newApproval];
      const { status, processed } = checkApprovalStatus(
        leave,
        updatedApprovals
      );

      leave.status = status;
      await leaveRepository.save(leave);

      if (processed && status === LeaveStatus.Approved) {
        const leaveBalanceRepository =
          AppDataSource.getRepository(LeaveBalance);
        const duration = calculateWorkingDays(
          new Date(leave.start_date),
          new Date(leave.end_date)
        );
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
      if (Boom.isBoom(error)) throw error;
      console.error("Error approving leave request:", error);
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

    if (userCredentials.role_id !== 3) {
      throw Boom.forbidden("Only Managers can reject leaves");
    }

    if (isNaN(leaveId)) {
      throw Boom.badRequest("Invalid leave ID");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveApprovalRepository =
        AppDataSource.getRepository(LeaveApproval);

      const leave = await leaveRepository.findOne({
        where: { leave_id: leaveId, status: LeaveStatus.Pending },
        relations: ["user", "approvals"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found or not pending");
      }

      if (leave.user.manager_id !== userCredentials.user_id) {
        throw Boom.forbidden("You are not the manager for this employee");
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: { leave_id: leaveId, approver_id: userCredentials.user_id },
      });
      if (
        existingApproval &&
        existingApproval.action === ApprovalAction.Rejected
      ) {
        throw Boom.conflict("Leave already rejected by you");
      }

      const newApproval = new LeaveApproval();
      newApproval.leave_id = leaveId;
      newApproval.approver_id = userCredentials.user_id;
      newApproval.approver_role_id = userCredentials.role_id;
      newApproval.action = ApprovalAction.Rejected;
      newApproval.comments = payload.comments || "";
      newApproval.approved_at = new Date();

      await leaveApprovalRepository.save(newApproval);

      leave.status = LeaveStatus.Rejected;
      await leaveRepository.save(leave);

      return h.response({ message: "Leave rejected successfully" }).code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error rejecting leave request:", error);
      throw Boom.internal("Internal server error rejecting leave");
    }
  }

  async getTeamAvailability(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { period = "week", date = new Date().toISOString() } =
      request.query as {
        period?: "day" | "week" | "month";
        date?: string;
      };

    if (userCredentials.role_id !== 3) {
      throw Boom.forbidden("Only Managers can view team availability");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const userRepository = AppDataSource.getRepository(User);

      const teamMembers = await userRepository.find({
        where: { manager_id: userCredentials.user_id },
        select: ["user_id", "name", "email"],
      });

      const startDate = new Date(date);
      let endDate: Date;
      switch (period) {
        case "day":
          endDate = new Date(startDate);
          break;
        case "week":
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          break;
        case "month":
          endDate = new Date(startDate);
          endDate.setMonth(startDate.getMonth() + 1);
          endDate.setDate(0);
          break;
        default:
          throw Boom.badRequest(
            "Invalid period; use 'day', 'week', or 'month'"
          );
      }

      const leaves = await leaveRepository.find({
        where: {
          user_id: In(teamMembers.map((member) => member.user_id)),
          status: LeaveStatus.Approved,
          start_date: LessThanOrEqual(endDate),
          end_date: MoreThanOrEqual(startDate),
        },
        relations: ["user", "leaveType"],
      });

      const availability = teamMembers.map((member) => {
        const memberLeaves = leaves.filter(
          (leave) => leave.user_id === member.user_id
        );
        return {
          user_id: member.user_id,
          name: member.name,
          email: member.email,
          leaves: memberLeaves.map((leave) => ({
            leave_id: leave.leave_id,
            start_date: leave.start_date,
            end_date: leave.end_date,
            leave_type: leave.leaveType.name,
          })),
        };
      });

      return h
        .response({
          period,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          team: availability,
        })
        .code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error fetching team availability:", error);
      throw Boom.internal("Internal server error fetching team availability");
    }
  }
}
