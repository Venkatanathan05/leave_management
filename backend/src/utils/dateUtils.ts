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

export type OverlapResult = {
  overlaps: boolean;
  isSubset: boolean;
  canMerge: boolean;
  conflictingLeave?: any;
  mergedStart?: Date;
  mergedEnd?: Date;
  message?: string;
};

export const checkLeaveOverlap = (
  newStartDate: Date,
  newEndDate: Date,
  existingLeaves: { start_date: Date; end_date: Date; status: string }[]
): OverlapResult => {
  for (const leave of existingLeaves) {
    if (leave.status === "Pending" || leave.status === "Approved") {
      const existingStart = new Date(leave.start_date);
      const existingEnd = new Date(leave.end_date);
      // Subset: new leave fully within existing
      if (newStartDate >= existingStart && newEndDate <= existingEnd) {
        return {
          overlaps: true,
          isSubset: true,
          canMerge: false,
          conflictingLeave: leave,
          message: `Leave already applied from ${existingStart.toLocaleDateString()} to ${existingEnd.toLocaleDateString()}`,
        };
      }
      // Overlap or adjacent: merge possible
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (
        (newStartDate <= existingEnd && newEndDate >= existingStart) ||
        newStartDate.getTime() === existingEnd.getTime() + oneDayMs ||
        newEndDate.getTime() === existingStart.getTime() - oneDayMs
      ) {
        const mergedStart = new Date(
          Math.min(newStartDate.getTime(), existingStart.getTime())
        );
        const mergedEnd = new Date(
          Math.max(newEndDate.getTime(), existingEnd.getTime())
        );
        return {
          overlaps: true,
          isSubset: false,
          canMerge: true,
          conflictingLeave: leave,
          mergedStart,
          mergedEnd,
          message: `Leave overlaps with existing leave from ${existingStart.toLocaleDateString()} to ${existingEnd.toLocaleDateString()}. Can merge into ${mergedStart.toLocaleDateString()} to ${mergedEnd.toLocaleDateString()}.`,
        };
      }
    }
  }
  return { overlaps: false, isSubset: false, canMerge: false };
};
