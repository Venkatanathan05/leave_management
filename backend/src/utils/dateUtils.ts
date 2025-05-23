export const calculateWorkingDays = (
  startDate: Date,
  endDate: Date
): number => {
  let count = 0;
  const currentDate = new Date(startDate.getTime());
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return count;
};

export const checkLeaveOverlap = (
  newStartDate: Date,
  newEndDate: Date,
  existingLeaves: { start_date: Date; end_date: Date; status: string }[]
): { overlaps: boolean; conflictingLeave?: any } => {
  for (const leave of existingLeaves) {
    if (leave.status === "Pending" || leave.status === "Approved") {
      const existingStart = new Date(leave.start_date);
      const existingEnd = new Date(leave.end_date);
      if (newStartDate <= existingEnd && newEndDate >= existingStart) {
        return { overlaps: true, conflictingLeave: leave };
      }
    }
  }
  return { overlaps: false };
};
