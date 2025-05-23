import { AppDataSource } from "../data-source";
import { Leave, LeaveStatus } from "../entity/Leave";
import { User } from "../entity/User";
import { LeaveApproval } from "../entity/LeaveApproval";
import * as Hapi from "@hapi/boom";
import * as Boom from "@hapi/boom";
import { LEAVE_THRESHOLD_HR } from "../constants";

const leaveRepository = AppDataSource.getRepository(Leave);
const userRepository = AppDataSource.getRepository(User);
const leaveApprovalRepository = AppDataSource.getRepository(LeaveApproval);

export class ManagerController {
  async getPendingLeaveRequests(
    request: Hapi.Request,
    h: Hapi.ResponseToolkit
  ) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    if (!user.user_id || user.role_id === undefined) {
      throw Boom.unauthorized("User not authenticated or role missing");
    }

    try {
      // Find direct reports
      const reports = await userRepository.find({
        where: { manager_id: user.user_id },
        select: ["user_id"],
      });
      const reportUserIds = reports.map((report) => report.user_id);

      if (reportUserIds.length === 0) {
        return h.response([]).code(200);
      }

      // Fetch pending leave requests
      const pendingRequests = await leaveRepository
        .createQueryBuilder("leave")
        .where("leave.status = :status", { status: LeaveStatus.Pending })
        .andWhere("leave.user_id IN (:...userIds)", { userIds: reportUserIds })
        .leftJoinAndSelect("leave.user", "user")
        .leftJoinAndSelect("leave.leaveType", "leaveType")
        .select([
          "leave.leave_id",
          "leave.start_date",
          "leave.end_date",
          "leave.reason",
          "leave.status",
          "leave.applied_at",
          "user.user_id",
          "user.name",
          "leaveType.type_id",
          "leaveType.name",
        ])
        .orderBy("leave.applied_at", "ASC")
        .getMany();

      return h.response(pendingRequests).code(200);
    } catch (error) {
      console.error("Error fetching pending leave requests:", error);
      throw Boom.internal(
        "Internal server error fetching pending leave requests"
      );
    }
  }

  async approveLeaveRequest(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { leave_id } = request.params;
    const { comment } = request.payload as { comment?: string };

    if (user.role_id !== 3) {
      throw Boom.unauthorized("Only managers can approve leave requests");
    }

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id) },
        relations: ["user"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      // Verify the leave belongs to a direct report
      const reports = await userRepository.find({
        where: { manager_id: user.user_id },
        select: ["user_id"],
      });
      const reportUserIds = reports.map((report) => report.user_id);

      if (!reportUserIds.includes(leave.user.user_id)) {
        throw Boom.forbidden("Not authorized to approve this leave request");
      }

      // Calculate leave duration
      const startDate = new Date(leave.start_date);
      const endDate = new Date(leave.end_date);
      const duration =
        Math.ceil(
          (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)
        ) + 1;

      // Create approval record
      const approval = new LeaveApproval();
      approval.leave = leave;
      approval.approver_id = user.user_id;
      approval.approver_role_id = user.role_id;
      approval.status = LeaveStatus.Approved;
      approval.comment = comment || "Approved by manager";
      approval.approved_at = new Date();

      await leaveApprovalRepository.save(approval);

      // Update leave status
      leave.status =
        duration > LEAVE_THRESHOLD_HR
          ? LeaveStatus.Pending
          : LeaveStatus.Approved;
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

    if (user.role_id !== 3) {
      throw Boom.unauthorized("Only managers can reject leave requests");
    }

    try {
      const leave = await leaveRepository.findOne({
        where: { leave_id: parseInt(leave_id) },
        relations: ["user"],
      });

      if (!leave) {
        throw Boom.notFound("Leave request not found");
      }

      // Verify the leave belongs to a direct report
      const reports = await userRepository.find({
        where: { manager_id: user.user_id },
        select: ["user_id"],
      });
      const reportUserIds = reports.map((report) => report.user_id);

      if (!reportUserIds.includes(leave.user.user_id)) {
        throw Boom.forbidden("Not authorized to reject this leave request");
      }

      // Create rejection record
      const approval = new LeaveApproval();
      approval.leave = leave;
      approval.approver_id = user.user_id;
      approval.approver_role_id = user.role_id;
      approval.status = LeaveStatus.Rejected;
      approval.comment = comment || "Rejected by manager";
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

  async getTeamAvailability(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { period, date } = request.query as {
      period: "day" | "week" | "month";
      date?: string;
    };

    if (user.role_id !== 3) {
      throw Boom.unauthorized("Only managers can view team availability");
    }

    try {
      // Find direct reports
      const reports = await userRepository.find({
        where: { manager_id: user.user_id },
        select: ["user_id", "name"],
      });

      if (reports.length === 0) {
        return h.response([]).code(200);
      }

      const reportUserIds = reports.map((report) => report.user_id);
      const startDate = date ? new Date(date) : new Date();

      let dateRange;
      if (period === "day") {
        dateRange = {
          start: startDate,
          end: startDate,
        };
      } else if (period === "week") {
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        dateRange = {
          start: startDate,
          end: endDate,
        };
      } else if (period === "month") {
        const endDate = new Date(
          startDate.getFullYear(),
          startDate.getMonth() + 1,
          0
        );
        dateRange = {
          start: startDate,
          end: endDate,
        };
      } else {
        throw Boom.badRequest("Invalid period specified");
      }

      // Fetch approved leaves within the date range
      const leaves = await leaveRepository
        .createQueryBuilder("leave")
        .where("leave.user_id IN (:...userIds)", { userIds: reportUserIds })
        .andWhere("leave.status = :status", { status: LeaveStatus.Approved })
        .andWhere("leave.start_date <= :endDate", { endDate: dateRange.end })
        .andWhere("leave.end_date >= :startDate", {
          startDate: dateRange.start,
        })
        .leftJoinAndSelect("leave.user", "user")
        .select([
          "leave.leave_id",
          "leave.start_date",
          "leave.end_date",
          "user.user_id",
          "user.name",
        ])
        .getMany();

      // Format availability
      const availability = reports.map((report) => {
        const userLeaves = leaves.filter(
          (leave) => leave.user.user_id === report.user_id
        );
        return {
          user_id: report.user_id,
          name: report.name,
          leaves: userLeaves.map((leave) => ({
            leave_id: leave.leave_id,
            start_date: leave.start_date,
            end_date: leave.end_date,
          })),
        };
      });

      return h
        .response({
          period,
          date_range: {
            start: dateRange.start.toISOString().split("T")[0],
            end: dateRange.end.toISOString().split("T")[0],
          },
          availability,
        })
        .code(200);
    } catch (error) {
      console.error("Error fetching team availability:", error);
      throw Boom.internal("Internal server error fetching team availability");
    }
  }
}
