import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { LeaveType } from "../entity/LeaveType";
import { AdminController } from "../controllers/adminController";
import { ADMIN_ROLE_ID } from "../constants";
import { LeaveBalance } from "../entity/LeaveBalance";
import { Leave } from "../entity/Leave";
import { LeaveStatus } from "../entity/Leave";
import { In } from "typeorm";

const leaveTypeRepository = AppDataSource.getRepository(LeaveType);
const adminController = new AdminController();

interface CreateLeaveTypePayload {
  name: string;
  requires_approval: boolean;
  is_balance_based: boolean;
}

const adminRoutes: Hapi.ServerRoute[] = [
  {
    method: "GET",
    path: "/api/admin/leave-types",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      if (user.role_id !== ADMIN_ROLE_ID) {
        throw Boom.forbidden("Forbidden: Only admins can view this resource");
      }

      try {
        const leaveTypes = await leaveTypeRepository.find({
          order: { name: "ASC" },
        });
        return h.response(leaveTypes).code(200);
      } catch (error) {
        console.error("Error fetching all leave types for admin:", error);
        throw Boom.internal("Internal server error fetching leave types");
      }
    },
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "POST",
    path: "/api/admin/leave-types",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      const { name, requires_approval, is_balance_based } =
        request.payload as CreateLeaveTypePayload;

      if (user.role_id !== ADMIN_ROLE_ID) {
        throw Boom.forbidden("Forbidden: Only admins can perform this action");
      }
      if (
        !name ||
        typeof requires_approval !== "boolean" ||
        typeof is_balance_based !== "boolean"
      ) {
        throw Boom.badRequest("Missing required fields or invalid types");
      }

      try {
        const newLeaveType = new LeaveType();
        newLeaveType.name = name.trim();
        newLeaveType.requires_approval = requires_approval;
        newLeaveType.is_balance_based = is_balance_based;

        const createdLeaveType = await leaveTypeRepository.save(newLeaveType);
        return h.response(createdLeaveType).code(201);
      } catch (error) {
        console.error("Error creating new leave type:", error);
        throw Boom.internal("Internal server error creating leave type");
      }
    },
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "DELETE",
    path: "/api/admin/leave-types/{id}",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      const leaveTypeId = parseInt(request.params.id, 10);

      if (user.role_id !== ADMIN_ROLE_ID) {
        throw Boom.forbidden("Forbidden: Only admins can delete leave types");
      }
      if (isNaN(leaveTypeId)) {
        throw Boom.badRequest("Invalid leave type ID provided");
      }

      try {
        const existingLeaves = await AppDataSource.getRepository(Leave).count({
          where: { type_id: leaveTypeId },
        });
        if (existingLeaves > 0) {
          throw Boom.conflict(
            "Cannot delete leave type: it is used by existing leave requests"
          );
        }
        const existingBalances = await AppDataSource.getRepository(
          LeaveBalance
        ).count({
          where: { type_id: leaveTypeId },
        });
        if (existingBalances > 0) {
          throw Boom.conflict(
            "Cannot delete leave type: it is used by existing leave balances"
          );
        }

        const deleteResult = await leaveTypeRepository.delete(leaveTypeId);
        if (deleteResult.affected === 0) {
          throw Boom.notFound("Leave type not found");
        }

        return h
          .response({ message: "Leave type deleted successfully" })
          .code(200);
      } catch (error) {
        if (Boom.isBoom(error)) throw error;
        console.error(`Error deleting leave type ${leaveTypeId}:`, error);
        throw Boom.internal("Internal server error deleting leave type");
      }
    },
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "POST",
    path: "/api/admin/users",
    handler: (request, h) => adminController.createUser(request, h),
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "DELETE",
    path: "/api/admin/users/{user_id}",
    handler: (request, h) => adminController.deleteUser(request, h),
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "GET",
    path: "/api/admin/users",
    handler: (request, h) => adminController.getAllUsers(request, h),
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "POST",
    path: "/api/admin/leave-requests/{leave_id}/approve",
    handler: (request, h) => adminController.approveLeaveRequest(request, h),
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "POST",
    path: "/api/admin/leave-requests/{leave_id}/reject",
    handler: (request, h) => adminController.rejectLeaveRequest(request, h),
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
  {
    method: "GET",
    path: "/api/admin/leave-requests/approvals-needed",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      if (user.role_id !== ADMIN_ROLE_ID) {
        throw Boom.forbidden("Forbidden: Only admins can view this resource");
      }

      try {
        const leavesNeedingAdminApproval = await AppDataSource.getRepository(
          Leave
        ).find({
          where: [
            { status: LeaveStatus.Awaiting_Admin_Approval },
            { status: LeaveStatus.Pending, user: { role_id: In([3, 5]) } }, // Managers, HR
          ],
          relations: ["user", "leaveType", "approvals"],
          order: { applied_at: "ASC" },
        });
        return h.response(leavesNeedingAdminApproval).code(200);
      } catch (error) {
        console.error(
          "Error fetching leave requests needing Admin approval:",
          error
        );
        throw Boom.internal("Internal server error fetching leave requests");
      }
    },
    options: { auth: { strategy: "jwt", scope: ["Admin"] } },
  },
];

export { adminRoutes };
