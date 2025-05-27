import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { LeaveType } from "../entity/LeaveType";
import { LeaveBalance } from "../entity/LeaveBalance";
import { Leave, LeaveStatus } from "../entity/Leave";
import { User } from "../entity/User";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import {
  roleInitialBalances,
  ADMIN_ROLE_ID,
  EMPLOYEE_ROLE_ID,
  MANAGER_ROLE_ID,
  INTERN_ROLE_ID,
  HOLIDAYS_2025,
} from "../constants";
import moment from "moment";
import { LeaveController } from "../controllers/leaveController";

const leaveTypeRepository = AppDataSource.getRepository(LeaveType);
const leaveBalanceRepository = AppDataSource.getRepository(LeaveBalance);
const leaveRepository = AppDataSource.getRepository(Leave);
const userRepository = AppDataSource.getRepository(User);
const leaveApprovalRepository = AppDataSource.getRepository(LeaveApproval);
const leaveController = new LeaveController();

interface CalendarEventResponse {
  leave_id: number;
  title: string;
  start: string;
  end: string;
  userName: string;
  userEmail: string;
  leaveTypeName: string;
  status: string;
}

const leaveRoutes: Hapi.ServerRoute[] = [
  {
    method: "GET",
    path: "/api/leaves/types",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      if (!user.user_id || user.role_id === undefined) {
        throw Boom.unauthorized("User not authenticated or role missing");
      }

      try {
        const allLeaveTypes = await leaveTypeRepository.find({
          order: { name: "ASC" },
        });
        let applyableLeaveTypes: LeaveType[] = [];

        if (user.role_id === INTERN_ROLE_ID) {
          applyableLeaveTypes = allLeaveTypes.filter(
            (type) => type.name === "Loss of Pay"
          );
        } else if (user.role_id !== ADMIN_ROLE_ID) {
          const rulesForRole = roleInitialBalances[user.role_id] || [];
          const allowedLeaveTypeNames = rulesForRole.map(
            (rule) => rule.leaveTypeName
          );
          applyableLeaveTypes = allLeaveTypes.filter((type) =>
            allowedLeaveTypeNames.includes(type.name)
          );
        } else {
          applyableLeaveTypes = allLeaveTypes;
        }

        return h.response(applyableLeaveTypes).code(200);
      } catch (error) {
        console.error(
          `Error fetching leave types for user ${user.user_id}:`,
          error
        );
        throw Boom.internal("Internal server error fetching leave types");
      }
    },
  },
  {
    method: "POST",
    path: "/api/leaves",
    handler: (request, h) => leaveController.applyLeave(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/leaves/balance",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as { user_id: number };
      if (!user.user_id) {
        throw Boom.unauthorized("User not authenticated or user ID missing");
      }

      try {
        const currentYear = new Date().getFullYear();
        const userBalances = await leaveBalanceRepository.find({
          where: { user_id: user.user_id, year: currentYear },
          relations: ["leaveType"],
        });
        return h.response(userBalances).code(200);
      } catch (error) {
        console.error("Error fetching user leave balances:", error);
        throw Boom.internal("Internal server error fetching leave balances");
      }
    },
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/leaves/my",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as { user_id: number };
      if (!user.user_id) {
        throw Boom.unauthorized("User not authenticated or user ID missing");
      }

      try {
        const userLeaves = await leaveRepository.find({
          where: { user_id: user.user_id },
          relations: ["leaveType", "approvals"],
          order: { applied_at: "DESC" },
        });
        return h.response(userLeaves).code(200);
      } catch (error) {
        console.error("Error fetching user leave history:", error);
        throw Boom.internal("Internal server error fetching leave history");
      }
    },
    options: { auth: "jwt" },
  },
  {
    method: "PUT",
    path: "/api/leaves/my/{id}/cancel",
    handler: (request, h) => leaveController.cancelLeave(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/leaves/calendar/leave-availability",
    handler: (request, h) => leaveController.getLeaveAvailability(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/holidays",
    handler: (request, h) => leaveController.getHolidays(request, h),
    options: { auth: "jwt" },
  },
];

export { leaveRoutes };
