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

        if (user.role_id !== ADMIN_ROLE_ID) {
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
  },
  {
    method: "PUT",
    path: "/api/leaves/my/{id}/cancel",
    handler: (request, h) => leaveController.cancelLeave(request, h),
  },
  {
    method: "GET",
    path: "/api/leaves/calendar/leave-availability",
    handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
      const user = request.auth.credentials as {
        user_id: number;
        role_id: number;
      };
      if (!user) {
        throw Boom.unauthorized("Unauthorized: User not authenticated");
      }

      try {
        let queryBuilder = leaveRepository
          .createQueryBuilder("leave")
          .leftJoinAndSelect("leave.user", "user")
          .leftJoinAndSelect("leave.leaveType", "leaveType")
          .select([
            "leave.leave_id",
            "leave.start_date",
            "leave.end_date",
            "leave.status",
            "user.user_id",
            "user.name",
            "user.email",
            "leaveType.name",
          ])
          .where("leave.status = :statusApproved", {
            statusApproved: LeaveStatus.Approved,
          });

        if (user.role_id === ADMIN_ROLE_ID) {
          // Admins see all approved leaves
        } else if (user.role_id === MANAGER_ROLE_ID) {
          queryBuilder.andWhere(
            "(user.manager_id = :managerId OR user.user_id = :currentUserId)",
            { managerId: user.user_id, currentUserId: user.user_id }
          );
        } else if (user.role_id === 5) {
          // HR
          queryBuilder.andWhere("user.role_id IN (:...roleIds)", {
            roleIds: [2, 3, 4], // Employees, Managers, Interns
          });
        } else if (
          user.role_id === EMPLOYEE_ROLE_ID ||
          user.role_id === INTERN_ROLE_ID
        ) {
          const currentUserDetails = await userRepository.findOne({
            where: { user_id: user.user_id },
            select: ["user_id", "manager_id"],
          });
          if (!currentUserDetails) {
            throw Boom.notFound("Current user details not found");
          }

          queryBuilder.andWhere(
            `(
              user.user_id = :currentUserId
              ${
                currentUserDetails.manager_id
                  ? "OR user.user_id = :managerOfCurrentUser"
                  : ""
              }
              ${
                currentUserDetails.manager_id
                  ? "OR (user.manager_id = :sameManagerId AND user.user_id != :excludeSelfId)"
                  : ""
              }
            )`,
            {
              currentUserId: user.user_id,
              ...(currentUserDetails.manager_id && {
                managerOfCurrentUser: currentUserDetails.manager_id,
                sameManagerId: currentUserDetails.manager_id,
                excludeSelfId: user.user_id,
              }),
            }
          );
        } else {
          throw Boom.forbidden(
            "Your role does not permit viewing this calendar"
          );
        }

        const rawLeaveEvents = await queryBuilder.getRawMany();
        const formattedEvents: CalendarEventResponse[] = rawLeaveEvents.map(
          (row: any) => ({
            leave_id: row.leave_leave_id,
            title: row.user_name,
            start: row.leave_start_date
              ? moment(row.leave_start_date).format("YYYY-MM-DD")
              : "",
            end: row.leave_end_date
              ? moment(row.leave_end_date).format("YYYY-MM-DD")
              : "",
            userName: row.user_name,
            userEmail: row.user_email,
            leaveTypeName: row.leaveType_name,
            status: row.leave_status,
          })
        );

        return h.response(formattedEvents).code(200);
      } catch (error) {
        if (Boom.isBoom(error)) throw error;
        console.error("Error fetching leave availability:", error);
        throw Boom.internal("Internal server error");
      }
    },
  },
];

export { leaveRoutes };
