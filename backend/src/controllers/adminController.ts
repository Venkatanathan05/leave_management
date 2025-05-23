import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Role } from "../entity/Role";
import { Leave } from "../entity/Leave";
import { LeaveApproval } from "../entity/LeaveApproval";
import { LeaveStatus } from "../entity/Leave";
import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { hashPassword } from "../utils/authUtils"; // Assume exists or will be added
import { Not } from "typeorm";

const userRepository = AppDataSource.getRepository(User);
const roleRepository = AppDataSource.getRepository(Role);
const leaveRepository = AppDataSource.getRepository(Leave);
const leaveApprovalRepository = AppDataSource.getRepository(LeaveApproval);

export class AdminController {
  async createUser(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { name, email, password, role_id, manager_id } = request.payload as {
      name: string;
      email: string;
      password: string;
      role_id: number;
      manager_id?: number;
    };

    if (user.role_id !== 1) {
      throw Boom.unauthorized("Only admins can create users");
    }

    try {
      // Validate role
      const role = await roleRepository.findOne({ where: { role_id } });
      if (!role) {
        throw Boom.badRequest("Invalid role specified");
      }

      // Validate manager_id for Employees/Interns
      if ((role_id === 2 || role_id === 4) && manager_id) {
        const manager = await userRepository.findOne({
          where: { user_id: manager_id, role_id: 3 },
        });
        if (!manager) {
          throw Boom.badRequest("Invalid manager specified");
        }
      } else if ((role_id === 2 || role_id === 4) && !manager_id) {
        throw Boom.badRequest("Manager ID required for Employee/Intern");
      }

      // Check for existing user
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        throw Boom.conflict("User with this email already exists");
      }

      // Create user
      const newUser = new User();
      newUser.name = name;
      newUser.email = email;
      newUser.password_hash = await hashPassword(password); // Assume hashPassword utility
      newUser.role_id = role_id;
      newUser.manager_id = manager_id || null;
      await userRepository.save(newUser);

      return h
        .response({
          message: "User created successfully",
          user_id: newUser.user_id,
        })
        .code(201);
    } catch (error) {
      console.error("Error creating user:", error);
      throw Boom.internal("Internal server error creating user");
    }
  }

  async deleteUser(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { user_id: targetUserId } = request.params;

    if (user.role_id !== 1) {
      throw Boom.unauthorized("Only admins can delete users");
    }

    try {
      const targetUser = await userRepository.findOne({
        where: { user_id: parseInt(targetUserId) },
        relations: ["role"],
      });

      if (!targetUser) {
        throw Boom.notFound("User not found");
      }

      // Prevent self-deletion
      if (targetUser.user_id === user.user_id) {
        throw Boom.forbidden("Cannot delete own account");
      }

      // Handle Manager deletion
      if (targetUser.role_id === 3) {
        const employees = await userRepository.count({
          where: { manager_id: targetUser.user_id },
        });
        if (employees > 0) {
          const otherManagers = await userRepository.find({
            where: { role_id: 3, user_id: Not(targetUser.user_id) },
          });
          if (otherManagers.length === 0) {
            throw Boom.forbidden(
              "Cannot delete manager with assigned employees and no other managers available"
            );
          }
          // Reassign employees to a random manager
          const newManager =
            otherManagers[Math.floor(Math.random() * otherManagers.length)];
          await userRepository.update(
            { manager_id: targetUser.user_id },
            { manager_id: newManager.user_id }
          );
        }
      }

      // Handle HR deletion
      if (targetUser.role_id === 5) {
        const otherHRs = await userRepository.count({
          where: { role_id: 5, user_id: Not(targetUser.user_id) },
        });
        if (otherHRs === 0) {
          throw Boom.forbidden("Cannot delete the last HR");
        }
      }

      await userRepository.delete({ user_id: targetUser.user_id });
      return h.response({ message: "User deleted successfully" }).code(200);
    } catch (error) {
      console.error("Error deleting user:", error);
      throw Boom.internal("Internal server error deleting user");
    }
  }

  async approveLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_id } = request.params;
    const { comment } = request.payload as { comment?: string };

    if (user.role_id !== 1) {
      throw Boom.unauthorized("Only admins can approve leave requests");
    }

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id) },
        relations: ["user", "approvals"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      // Verify Admin-level approval is required
      const managerApproval = leave.approvals.find(
        (a) => a.approver_role_id === 3
      );
      const hrApproval = leave.approvals.find((a) => a.approver_role_id === 5);
      const requiresAdmin =
        leave.user.role_id === 5 || // HR leaves
        (leave.user.role_id === 3 &&
          hrApproval?.status === LeaveStatus.Approved) || // Manager leaves post-HR
        (leave.user.role_id === 2 &&
          hrApproval?.status === LeaveStatus.Approved); // Employee leaves post-HR

      if (!requiresAdmin) {
        throw Boom.forbidden("Admin approval not required for this leave");
      }

      // Create approval record
      const approval = new LeaveApproval();
      approval.leave = leave;
      approval.approver_id = user.user_id;
      approval.approver_role_id = user.role_id;
      approval.status = LeaveStatus.Approved;
      approval.comments = comment || "Approved by admin";
      approval.approved_at = new Date();

      await leaveApprovalRepository.save(approval);

      // Update leave status
      leave.status = LeaveStatus.Approved;
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

    if (user.role_id !== 1) {
      throw Boom.unauthorized("Only admins can reject leave requests");
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
      approval.comments = comment || "Rejected by admin";
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

  async getAllUsers(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };

    if (user.role_id !== 1) {
      throw Boom.unauthorized("Only admins can view all users");
    }

    try {
      const users = await userRepository
        .createQueryBuilder("user")
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
}
