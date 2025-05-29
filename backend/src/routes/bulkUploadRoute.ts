import * as Hapi from "@hapi/hapi";
import { LeaveController } from "../controllers/leaveController";

const leaveController = new LeaveController();

export const bulkUploadRoutes: Hapi.ServerRoute[] = [
  {
    method: "POST",
    path: "/leaves/bulk-upload",
    handler: leaveController.bulkUploadHandler.bind(leaveController),
    options: {
      auth: "jwt",
      payload: {
        maxBytes: 10485760, // 10MB
        parse: true,
        output: "stream", // Important for file upload
        multipart: true, // Enable multipart/form-data
        allow: "multipart/form-data",
      },
      description: "Bulk leave upload via CSV",
      tags: ["api"],
    },
  },
];
