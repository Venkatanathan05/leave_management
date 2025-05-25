import * as Hapi from "@hapi/hapi";
import { AdminController } from "../controllers/adminController";

const adminController = new AdminController();

const adminRoutes: Hapi.ServerRoute[] = [
  {
    method: "POST",
    path: "/api/admin/users",
    handler: (request, h) => adminController.createUser(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "DELETE",
    path: "/api/admin/users/{user_id}",
    handler: (request, h) => adminController.deleteUser(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "GET",
    path: "/api/admin/users",
    handler: (request, h) => adminController.getAllUsers(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/admin/leave-requests/{leave_id}/approve",
    handler: (request, h) => adminController.approveLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
  {
    method: "POST",
    path: "/api/admin/leave-requests/{leave_id}/reject",
    handler: (request, h) => adminController.rejectLeaveRequest(request, h),
    options: { auth: "jwt" },
  },
];

export { adminRoutes };
