export const ADMIN_ROLE_ID = 1;
export const EMPLOYEE_ROLE_ID = 2;
export const MANAGER_ROLE_ID = 3;
export const INTERN_ROLE_ID = 4;
export const HR_ROLE_ID = 5;

export const LEAVE_THRESHOLD_HR = 5; // Days requiring HR approval
export const LEAVE_THRESHOLD_ADMIN = 10; // Days requiring Admin approval

export const roleInitialBalances: {
  [roleId: number]: { leaveTypeName: string; initialDays: number }[];
} = {
  [EMPLOYEE_ROLE_ID]: [
    { leaveTypeName: "Casual Leave", initialDays: 15 },
    { leaveTypeName: "Sick Leave", initialDays: 15 },
  ],
  [MANAGER_ROLE_ID]: [
    { leaveTypeName: "Casual Leave", initialDays: 15 },
    { leaveTypeName: "Sick Leave", initialDays: 15 },
  ],
  [INTERN_ROLE_ID]: [{ leaveTypeName: "Loss of Pay", initialDays: 1000 }],
  [HR_ROLE_ID]: [
    { leaveTypeName: "Casual Leave", initialDays: 15 },
    { leaveTypeName: "Sick Leave", initialDays: 15 },
  ],
};
