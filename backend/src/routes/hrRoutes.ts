import * as Hapi from "@hapi/hapi";
import { HRController } from "../controllers/hrController";

const hrController = new HRController();

const hrRoutes: Hapi.ServerRoute[] = [
  {
    method: "GET",
    path: "/api/hr/users",
    handler: (request, h) => hrController.getUsers(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/hr/users/{user_id}/leave-info",
    handler: (request, h) => hrController.getUserLeaveInfo(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/hr/leave-requests/{leave_id}/approve",
    handler: (request, h) => hrController.approveLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/hr/leave-requests/{leave_id}/reject",
    handler: (request, h) => hrController.rejectLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/hr/leave-requests/pending",
    handler: (request, h) => hrController.getPendingLeaveRequests(request, h),
    options: { auth: "jwt" },
  },
];

export { hrRoutes };
