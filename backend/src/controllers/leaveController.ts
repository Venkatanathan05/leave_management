import { AppDataSource } from "../data-source";
import { Leave } from "../entity/Leave";
import { LeaveType } from "../entity/LeaveType";
import { LeaveStatus } from "../entity/Leave";
import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { checkLeaveOverlap } from "../utils/dateUtils";
import { Between, Not } from "typeorm";

const leaveRepository = AppDataSource.getRepository(Leave);
const leaveTypeRepository = AppDataSource.getRepository(LeaveType);

export class LeaveController {
  async applyLeave(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_type_id, start_date, end_date, reason } = request.payload as {
      leave_type_id: number;
      start_date: string;
      end_date: string;
      reason: string;
    };

    try {
      // Validate leave type
      const leaveType = await leaveTypeRepository.findOne({
        where: { type_id: leave_type_id },
      });
      if (!leaveType) {
        throw Boom.badRequest("Invalid leave type");
      }

      // Validate dates
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      if (startDate > endDate) {
        throw Boom.badRequest("End date must be after start date");
      }

      // Check for overlapping leaves
      const overlappingLeaves = await checkLeaveOverlap(
        user.user_id,
        startDate,
        endDate
      );
      if (overlappingLeaves.length > 0) {
        throw Boom.badRequest(
          "Leave overlaps with existing leave from " +
            overlappingLeaves[0].start_date.toISOString().split("T")[0] +
            " to " +
            overlappingLeaves[0].end_date.toISOString().split("T")[0]
        );
      }

      // Check for same-day duplicate
      const sameDayLeaves = await leaveRepository.find({
        where: {
          user_id: user.user_id,
          start_date: Between(startDate, endDate),
          status: Not(LeaveStatus.Rejected),
        },
      });
      if (sameDayLeaves.length > 0) {
        throw Boom.badRequest(
          "Leave already applied for one or more of these dates"
        );
      }

      // Create leave
      const leave = new Leave();
      leave.user_id = user.user_id;
      leave.leaveType = leaveType;
      leave.start_date = startDate;
      leave.end_date = endDate;
      leave.reason = reason;
      leave.status = LeaveStatus.Pending;
      leave.applied_at = new Date();

      await leaveRepository.save(leave);

      return h
        .response({
          message: "Leave applied successfully",
          leave_id: leave.leave_id,
        })
        .code(201);
    } catch (error) {
      console.error("Error applying leave:", error);
      throw Boom.internal("Internal server error applying leave");
    }
  }

  async cancelLeave(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_id } = request.params;

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id), user_id: user.user_id },
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found or not owned by user");
      }

      if (leave.status !== LeaveStatus.Pending) {
        throw Boom.badRequest("Only pending leaves can be canceled");
      }

      await leaveRepository.delete({ leave_id: leave.leave_id });
      return h.response({ message: "Leave canceled successfully" }).code(200);
    } catch (error) {
      console.error("Error canceling leave:", error);
      throw Boom.internal("Internal server error canceling leave");
    }
  }
}
