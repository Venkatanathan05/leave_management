export const ADMIN_ROLE_ID = 1;
export const EMPLOYEE_ROLE_ID = 2;
export const MANAGER_ROLE_ID = 3;
export const INTERN_ROLE_ID = 4;
export const HR_ROLE_ID = 5;

export const LEAVE_THRESHOLD_HR = 3; // Days requiring HR approval
export const LEAVE_THRESHOLD_ADMIN = 4; // Days requiring Admin approval

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

export const HOLIDAYS_2025 = [
  { name: "New Year's Day", date: "2025-01-01" },
  { name: "Pongal", date: "2025-01-14" },
  { name: "Republic Day", date: "2025-01-26" },
  { name: "Independence Day", date: "2025-08-15" },
  { name: "Gandhi Jayanti", date: "2025-10-02" },
  { name: "Diwali", date: "2025-10-20" },
  { name: "Christmas", date: "2025-12-25" },
];
