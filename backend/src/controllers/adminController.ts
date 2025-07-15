import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveBalance } from "../entity/LeaveBalance";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { Role } from "../entity/Role";
import { roleInitialBalances } from "../constants";
import { calculateWorkingDays } from "../utils/dateUtils";
import { checkApprovalStatus } from "../utils/approvalUtils";
import { hashPassword } from "../utils/authUtils";
import { LeaveType } from "../entity/LeaveType";
import { In } from "typeorm";

export class AdminController {
  async createUser(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const { name, email, role_id, manager_id, password } = request.payload as {
      name: string;
      email: string;
      role_id: number;
      manager_id?: number;
      password: string;
    };

    if (!name || !email || !role_id || !password) {
      throw Boom.badRequest("Name, email, role_id, and password are required");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const roleRepository = AppDataSource.getRepository(Role);
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);

      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        throw Boom.conflict("Email already exists");
      }

      const role = await roleRepository.findOne({ where: { role_id } });
      if (!role) {
        throw Boom.badRequest("Invalid role_id");
      }

      let manager = null;
      if (manager_id) {
        manager = await userRepository.findOne({
          where: { user_id: manager_id, role_id: 3 },
        });
        if (!manager) {
          throw Boom.badRequest("Invalid manager_id or manager role");
        }
      }

      // Hash the password provided by user
      const hashedPassword = await hashPassword(password);

      const user = new User();
      user.name = name;
      user.email = email;
      user.password_hash = hashedPassword;
      user.role_id = role_id;
      user.manager_id = manager_id || null;

      const savedUser = await userRepository.save(user);

      const currentYear = new Date().getFullYear();
      const balancesToCreate = roleInitialBalances[role_id] || [];
      const leaveBalances: LeaveBalance[] = [];

      for (const rule of balancesToCreate) {
        const leaveType = await AppDataSource.getRepository(LeaveType).findOne({
          where: { name: rule.leaveTypeName },
        });
        if (leaveType) {
          const leaveBalance = new LeaveBalance();
          leaveBalance.user_id = savedUser.user_id;
          leaveBalance.type_id = leaveType.type_id;
          leaveBalance.year = currentYear;
          leaveBalance.total_days = rule.initialDays;
          leaveBalance.used_days = 0;
          leaveBalance.available_days = rule.initialDays;
          leaveBalances.push(leaveBalance);
        }
      }

      if (leaveBalances.length > 0) {
        await leaveBalanceRepository.save(leaveBalances);
      }

      return h
        .response({
          message: "User created successfully",
          user: {
            user_id: savedUser.user_id,
            name: savedUser.name,
            email: savedUser.email,
            role_id: savedUser.role_id,
            manager_id: savedUser.manager_id,
          },
        })
        .code(201);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error creating user:", error);
      throw Boom.internal("Internal server error creating user");
    }
  }

  async deleteUser(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userId = parseInt(request.params.user_id, 10);
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (isNaN(userId)) {
      throw Boom.badRequest("Invalid user ID");
    }

    if (userCredentials.user_id === userId) {
      throw Boom.forbidden("Cannot delete your own account");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);

      const user = await userRepository.findOne({ where: { user_id: userId } });
      if (!user) {
        throw Boom.notFound("User not found");
      }

      const pendingLeaves = await leaveRepository.count({
        where: {
          user_id: userId,
          status: In([
            LeaveStatus.Pending,
            LeaveStatus.Awaiting_Admin_Approval,
          ]),
        },
      });
      if (pendingLeaves > 0) {
        throw Boom.conflict("Cannot delete user with pending leave requests");
      }

      await leaveBalanceRepository.delete({ user_id: userId });
      await leaveRepository.delete({ user_id: userId });
      await userRepository.delete(userId);

      return h.response({ message: "User deleted successfully" }).code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error deleting user:", error);
      throw Boom.internal("Internal server error deleting user");
    }
  }

  async getAllUsers(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    console.log("getAllUsers:", { role_id: userCredentials.role_id });

    if (userCredentials.role_id !== 1) {
      throw Boom.forbidden("Only Admin can view all users");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const users = await userRepository.find({
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
      console.error("Error fetching all users:", error);
      throw Boom.internal("Internal server error fetching users");
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

    if (userCredentials.role_id !== 1) {
      throw Boom.forbidden("Only Admin can view pending leave requests");
    }

    try {
      const leaveRepository = AppDataSource.getRepository(Leave);
      const leaves = await leaveRepository.find({
        where: { status: LeaveStatus.Awaiting_Admin_Approval },
        relations: ["user", "leaveType", "approvals"],
        order: { applied_at: "ASC" },
      });

      return h.response(leaves).code(200);
    } catch (error) {
      console.error("Error fetching admin pending leave requests:", error);
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

    if (userCredentials.role_id !== 1) {
      throw Boom.forbidden("Only Admin can approve leaves");
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

      const { working } = calculateWorkingDays(
        new Date(leave.start_date),
        new Date(leave.end_date)
      );
      if (
        (leave.user.role_id === 2 || leave.user.role_id === 4) &&
        working > 5
      ) {
        const managerApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 3 && a.action === ApprovalAction.Approved
        );
        const hrApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 5 && a.action === ApprovalAction.Approved
        );
        if (!managerApproved || !hrApproved) {
          throw Boom.badRequest("Manager and HR approval required first");
        }
      } else if (leave.user.role_id === 3 && working > 5) {
        const hrApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 5 && a.action === ApprovalAction.Approved
        );
        if (!hrApproved) {
          throw Boom.badRequest("HR approval required first");
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
          balance.used_days += leave.days_requested;
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

    if (userCredentials.role_id !== 1) {
      throw Boom.forbidden("Only Admin can reject leaves");
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

      const { working } = calculateWorkingDays(
        new Date(leave.start_date),
        new Date(leave.end_date)
      );
      if (
        (leave.user.role_id === 2 || leave.user.role_id === 4) &&
        working > 5
      ) {
        const managerApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 3 && a.action === ApprovalAction.Approved
        );
        const hrApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 5 && a.action === ApprovalAction.Approved
        );
        if (!managerApproved || !hrApproved) {
          throw Boom.badRequest("Manager and HR approval required first");
        }
      } else if (leave.user.role_id === 3 && working > 5) {
        const hrApproved = leave.approvals.some(
          (a) =>
            a.approver_role_id === 5 && a.action === ApprovalAction.Approved
        );
        if (!hrApproved) {
          throw Boom.badRequest("HR approval required first");
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

  async getMyActions(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (userCredentials.role_id !== 1) {
      throw Boom.forbidden("Access denied.");
    }

    try {
      const leaveApprovalRepository =
        AppDataSource.getRepository(LeaveApproval);

      const allActions = await leaveApprovalRepository.find({
        where: { approver_id: userCredentials.user_id },
        relations: {
          leave: {
            user: true,
            leaveType: true,
          },
        },
        order: {
          approved_at: "ASC", // Fetch oldest first to make filtering easier
        },
      });

      // --- De-duplication Logic ---
      // Use a Map to store only the most recent action for each leave ID.
      const latestActionsMap = new Map<number, LeaveApproval>();
      for (const action of allActions) {
        // Since we ordered by date ASC, each subsequent action for the same leave is newer.
        // This will overwrite any previous (older) action for the same leave.
        latestActionsMap.set(action.leave.leave_id, action);
      }

      // Convert the Map values back to an array and sort by date descending for the UI.
      const uniqueLatestActions = Array.from(latestActionsMap.values()).sort(
        (a, b) =>
          new Date(b.approved_at).getTime() - new Date(a.approved_at).getTime()
      );

      return h.response(uniqueLatestActions).code(200);
    } catch (error) {
      console.error("Error fetching admin's actions:", error);
      throw Boom.internal("Internal server error fetching your actions");
    }
  }
}
