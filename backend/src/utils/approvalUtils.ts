import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { LEAVE_THRESHOLD_HR, LEAVE_THRESHOLD_ADMIN } from "../constants";
import { calculateWorkingDays } from "./dateUtils";

export const getRequiredApprovals = (leave: Leave): number => {
  const duration = calculateWorkingDays(
    new Date(leave.start_date),
    new Date(leave.end_date)
  );
  if (!leave.leaveType.requires_approval) return 0;
  if (duration > LEAVE_THRESHOLD_ADMIN) return 3; // Manager -> HR -> Admin
  if (duration > LEAVE_THRESHOLD_HR) return 2; // Manager -> HR
  return 1; // Manager only
};

export const checkApprovalStatus = (
  leave: Leave,
  approvals: LeaveApproval[]
): { status: LeaveStatus; processed: boolean } => {
  const requiredApprovals = leave.required_approvals;
  const validApprovals = approvals.filter(
    (a) =>
      a.action === ApprovalAction.Approved ||
      a.action === ApprovalAction.Rejected
  );

  if (validApprovals.some((a) => a.action === ApprovalAction.Rejected)) {
    return { status: LeaveStatus.Rejected, processed: true };
  }

  const approvedCount = validApprovals.filter(
    (a) => a.action === ApprovalAction.Approved
  ).length;

  if (approvedCount >= requiredApprovals) {
    return { status: LeaveStatus.Approved, processed: true };
  }

  if (requiredApprovals === 3 && approvedCount >= 2) {
    return { status: LeaveStatus.Awaiting_Admin_Approval, processed: false };
  }
  if (requiredApprovals >= 2 && approvedCount >= 1) {
    return { status: LeaveStatus.Pending, processed: false }; // Awaiting HR
  }
  if (requiredApprovals >= 2 && approvedCount === 0) {
    return { status: LeaveStatus.Pending, processed: false }; // Awaiting Manager
  }

  return { status: LeaveStatus.Pending, processed: false };
};
