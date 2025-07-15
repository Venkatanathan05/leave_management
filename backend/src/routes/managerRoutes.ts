import * as Hapi from "@hapi/hapi";
import { ManagerController } from "../controllers/managerController";

const managerController = new ManagerController();

const managerRoutes: Hapi.ServerRoute[] = [
  {
    method: "GET",
    path: "/api/manager/pending-requests",
    handler: (request, h) =>
      managerController.getPendingLeaveRequests(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/manager/leave-requests/{leave_id}/approve",
    handler: (request, h) => managerController.approveLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/manager/leave-requests/{leave_id}/reject",
    handler: (request, h) => managerController.rejectLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/manager/team-availability",
    handler: (request, h) => managerController.getTeamAvailability(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/manager/team-users",
    handler: (request, h) => managerController.getUsers(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/manager/my-actions",
    handler: (request, h) => managerController.getMyActions(request, h),
    options: { auth: "jwt" },
  },
];

export { managerRoutes };
