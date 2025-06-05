import { Leave, LeaveStatus } from "../entity/Leave";
import { LeaveApproval, ApprovalAction } from "../entity/LeaveApproval";
import { LEAVE_THRESHOLD_HR, LEAVE_THRESHOLD_ADMIN } from "../constants";
import { calculateWorkingDays } from "./dateUtils";

export const getRequiredApprovals = (leave: Leave): number => {
  const { working } = calculateWorkingDays(
    new Date(leave.start_date),
    new Date(leave.end_date)
  );

  if (!leave.leaveType.requires_approval) return 0;

  let approvalsNeeded = 1;

  if (working > LEAVE_THRESHOLD_HR) {
    approvalsNeeded = 2;
  }
  if (working > LEAVE_THRESHOLD_ADMIN) {
    approvalsNeeded = 3;
  }

  const applicantRoleId = leave.user?.role_id;

  if (applicantRoleId === 3) {
    if (approvalsNeeded < 2) approvalsNeeded = 2;
  } else if (applicantRoleId === 5) {
    if (approvalsNeeded < 3) approvalsNeeded = 3;
  } else if (applicantRoleId === 1) {
    if (approvalsNeeded < 3) approvalsNeeded = 3;
  }

  return approvalsNeeded;
};

export const checkApprovalStatus = (
  leave: Leave,
  approvals: LeaveApproval[]
): { status: LeaveStatus; processed: boolean } => {
  const requiredApprovals = leave.required_approvals;
  const applicantRoleId = leave.user?.role_id; // Applicant's role

  const validApprovals = approvals.filter(
    (a, index, self) =>
      (a.action === ApprovalAction.Approved ||
        a.action === ApprovalAction.Rejected) &&
      index ===
        self.findIndex(
          (b) =>
            b.approver_role_id === a.approver_role_id && b.action === a.action
        )
  );

  if (validApprovals.some((a) => a.action === ApprovalAction.Rejected)) {
    return { status: LeaveStatus.Rejected, processed: true };
  }

  const requiredApprovers = [3, 5, 1];
  const actualApprovals = new Map();

  for (const approverRole of requiredApprovers) {
    const match = approvals.find(
      (a) =>
        a.approver_role_id === approverRole &&
        a.action === ApprovalAction.Approved
    );
    if (match) {
      actualApprovals.set(approverRole, match);
    }
  }

  const approvedRoles = Array.from(actualApprovals.keys());

  const approvedCount = approvedRoles.length;

  if (approvedCount >= requiredApprovals) {
    return { status: LeaveStatus.Approved, processed: true };
  }

  if (applicantRoleId === 5) {
    if (requiredApprovals === 3) {
      if (approvedCount === 0) {
        return {
          status: LeaveStatus.Awaiting_Admin_Approval,
          processed: false,
        };
      } else if (approvedCount === 1) {
        return {
          status: LeaveStatus.Approved,
          processed: true,
        };
      }
    }
  } else if (applicantRoleId === 3) {
    if (requiredApprovals === 2) {
      if (approvedCount === 0) {
        return { status: LeaveStatus.Pending_HR_Approval, processed: false };
      } else if (approvedCount === 1) {
        return {
          status: LeaveStatus.Approved,
          processed: true,
        };
      }
    } else if (requiredApprovals === 3) {
      if (approvedCount === 0) {
        return { status: LeaveStatus.Pending_HR_Approval, processed: false };
      } else if (approvedCount === 1) {
        return {
          status: LeaveStatus.Awaiting_Admin_Approval,
          processed: false,
        };
      } else if (approvedCount === 2) {
        return {
          status: LeaveStatus.Approved,
          processed: true,
        };
      }
    }
  } else if (applicantRoleId === 2 || applicantRoleId === 4) {
    if (requiredApprovals === 3) {
      if (approvedCount === 0) {
        return {
          status: LeaveStatus.Pending_Manager_Approval,
          processed: false,
        };
      } else if (approvedCount === 1) {
        return { status: LeaveStatus.Pending_HR_Approval, processed: false };
      } else if (approvedCount >= 2) {
        return {
          status: LeaveStatus.Awaiting_Admin_Approval,
          processed: false,
        };
      }
    } else if (requiredApprovals === 2) {
      if (approvedCount === 0) {
        return {
          status: LeaveStatus.Pending_Manager_Approval,
          processed: false,
        };
      } else if (approvedCount >= 1) {
        return { status: LeaveStatus.Pending_HR_Approval, processed: false };
      }
    } else if (requiredApprovals === 1) {
      return { status: LeaveStatus.Pending_Manager_Approval, processed: false };
    }
  } else {
    return { status: LeaveStatus.Pending_Manager_Approval, processed: false };
  }

  return { status: LeaveStatus.Pending_Manager_Approval, processed: false };
};
