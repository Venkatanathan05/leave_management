import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { In, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { User } from "../entity/User";
import { LeaveBalance } from "../entity/LeaveBalance";
import { calculateWorkingDays } from "../utils/dateUtils";
import { checkApprovalStatus } from "../utils/approvalUtils";
import { roleInitialBalances } from "../constants";

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
        where: { manager_id: userCredentials.user_id, role_id: In([2, 4]) },
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
        // Admin: get leaves pending Admin or general Pending status
        leaves = await leaveRepository.find({
          where: {
            status: In([
              LeaveStatus.Pending,
              LeaveStatus.Awaiting_Admin_Approval,
              LeaveStatus.Pending_Manager_Approval, // optionally include if admin should see these too
            ]),
          },
          relations: ["user", "leaveType", "approvals"],
          order: { applied_at: "ASC" },
        });
      } else if (userCredentials.role_id === 3) {
        // Manager: get leaves with status Pending or Pending_Manager_Approval for employees managed by this manager
        leaves = await leaveRepository
          .createQueryBuilder("leave")
          .leftJoinAndSelect("leave.user", "user")
          .leftJoinAndSelect("leave.leaveType", "leaveType")
          .leftJoinAndSelect("leave.approvals", "approvals")
          .where("leave.status IN (:...statuses)", {
            statuses: [
              LeaveStatus.Pending,
              LeaveStatus.Pending_Manager_Approval,
            ],
          })
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
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);

      const leave = await leaveRepository.findOne({
        where: {
          leave_id: leaveId,
          status: In([
            LeaveStatus.Pending,
            LeaveStatus.Pending_Manager_Approval, // Support for newer flow
          ]),
        },
        relations: ["user", "leaveType", "approvals"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found or not pending");
      }
      console.log(`Approving leave_id=${leaveId}:`, leave);

      if (leave.user.manager_id !== userCredentials.user_id) {
        throw Boom.forbidden("You are not the manager for this employee");
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: {
          leave_id: leaveId,
          approver_id: userCredentials.user_id,
          action: ApprovalAction.Pending,
        },
      });

      let approval: LeaveApproval;
      if (existingApproval) {
        approval = existingApproval;
        approval.action = ApprovalAction.Approved;
        approval.comments = payload.comments || "";
        approval.approved_at = new Date();
      } else {
        const finalApproval = await leaveApprovalRepository.findOne({
          where: {
            leave_id: leaveId,
            approver_id: userCredentials.user_id,
            action: In([ApprovalAction.Approved, ApprovalAction.Rejected]),
          },
        });
        if (finalApproval) {
          throw Boom.conflict(
            `Leave already ${finalApproval.action.toLowerCase()} by you`
          );
        }
        approval = new LeaveApproval();
        approval.leave_id = leave.leave_id;
        approval.approver_id = userCredentials.user_id;
        approval.approver_role_id = userCredentials.role_id;
        approval.action = ApprovalAction.Approved;
        approval.comments = payload.comments || "";
        approval.approved_at = new Date();
      }

      console.log(`Saving approval for leave_id=${leaveId}:`, approval);
      await leaveApprovalRepository.save(approval);

      leave.approvals = leave.approvals || [];
      leave.approvals = leave.approvals.filter(
        (a) => a.approval_id !== approval.approval_id
      );
      leave.approvals.push(approval);
      const { status, processed } = checkApprovalStatus(leave, leave.approvals);
      console.log(
        `Leave_id=${leaveId} status=${status}, processed=${processed}`
      );

      leave.status = status;
      await leaveRepository.save(leave);

      if (
        processed &&
        status === LeaveStatus.Approved &&
        leave.required_approvals === 1
      ) {
        console.log(
          `Updating balance for leave_id=${leaveId}, user_id=${leave.user_id}, type_id=${leave.type_id}`
        );
        let { working } = calculateWorkingDays(
          new Date(leave.start_date),
          new Date(leave.end_date)
        );
        if (
          working === 0 &&
          leave.start_date.toDateString() === leave.end_date.toDateString()
        ) {
          working = 1;
        }
        console.log(`Calculated duration: ${working} days`);

        let balance = await leaveBalanceRepository.findOne({
          where: {
            user_id: leave.user_id,
            type_id: leave.type_id,
            year: new Date().getFullYear(),
          },
        });

        if (!balance && leave.leaveType?.name) {
          const initialBalance = roleInitialBalances[leave.user.role_id]?.find(
            (rule) => rule.leaveTypeName === leave.leaveType.name
          );
          if (!initialBalance) {
            console.error(
              `No initial balance for role_id=${leave.user.role_id}, type_id=${leave.type_id}`
            );
            throw Boom.forbidden("No balance available for this leave type");
          }
          balance = new LeaveBalance();
          balance.user_id = leave.user_id;
          balance.type_id = leave.type_id;
          balance.year = new Date().getFullYear();
          balance.total_days = initialBalance.initialDays;
          balance.used_days = 0;
          balance.available_days = initialBalance.initialDays;
          console.log(`Created new balance: ${JSON.stringify(balance)}`);
          await leaveBalanceRepository.save(balance);
        }

        if (balance && leave.leaveType?.is_balance_based) {
          console.log(`Balance before update: ${JSON.stringify(balance)}`);
          console.log("Prev Used Days : " + balance.used_days);
          balance.used_days += working;
          console.log("Used Days : " + balance.used_days);
          console.log("Duration: " + working);
          console.log("");
          balance.available_days = balance.total_days - balance.used_days;
          await leaveBalanceRepository.save(balance);
          console.log(`Balance after update: ${JSON.stringify(balance)}`);
        } else {
          console.log(
            `No balance update for leave_id=${leaveId}: balance_exists=${!!balance}, is_balance_based=${
              leave.leaveType?.is_balance_based
            }`
          );
        }
      } else {
        console.log(
          `Balance update skipped for leave_id=${leaveId}: processed=${processed}, status=${status}, required_approvals=${leave.required_approvals}`
        );
      }

      return h
        .response({
          message: `Leave ${status.toLowerCase()} successfully`,
          toast: { type: "success", message: "Leave approved successfully" },
        })
        .code(200);
    } catch (error) {
      console.error(`Error approving leave_id=${leaveId}:`, error);
      throw Boom.internal("Internal server error approving request");
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
        relations: ["user"],
      });
      if (!leave) {
        throw Boom.notFound("Leave request not found or not pending");
      }
      console.log(`Rejecting leave_id=${leaveId}:`, leave);

      if (leave.user.manager_id !== userCredentials.user_id) {
        throw Boom.forbidden("You are not the manager for this employee");
      }

      const existingApproval = await leaveApprovalRepository.findOne({
        where: {
          leave_id: leaveId,
          approver_id: userCredentials.user_id,
          action: ApprovalAction.Pending,
        },
      });

      let approval: LeaveApproval;
      if (existingApproval) {
        approval = existingApproval;
        approval.action = ApprovalAction.Rejected;
        approval.comments = payload.comments || "";
        approval.approved_at = new Date();
      } else {
        const finalApproval = await leaveApprovalRepository.findOne({
          where: {
            leave_id: leaveId,
            approver_id: userCredentials.user_id,
            action: In([ApprovalAction.Approved, ApprovalAction.Rejected]),
          },
        });
        if (finalApproval) {
          throw Boom.conflict(
            `Leave already ${finalApproval.action.toLowerCase()} by you`
          );
        }
        approval = new LeaveApproval();
        approval.leave_id = leave.leave_id;
        approval.approver_id = userCredentials.user_id;
        approval.approver_role_id = userCredentials.role_id;
        approval.action = ApprovalAction.Rejected;
        approval.comments = payload.comments || "";
        approval.approved_at = new Date();
      }

      console.log(`Saving rejection for leave_id=${leaveId}:`, approval);
      await leaveApprovalRepository.save(approval);

      leave.status = LeaveStatus.Rejected;
      await leaveRepository.save(leave);

      return h
        .response({
          message: "Leave rejected successfully",
          toast: { type: "error", message: "Leave rejected" },
        })
        .code(200);
    } catch (error) {
      console.error(`Error rejecting leave_id=${leaveId}:`, error);
      throw Boom.internal("Internal server error rejecting request");
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
      console.error("Error fetching team availability:", error);
      throw Boom.internal("Internal server error fetching team availability");
    }
  }
}
