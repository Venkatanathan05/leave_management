import { LeaveStatus } from "../entity/Leave";
import { HOLIDAYS_2025 } from "../constants";

export const calculateWorkingDays = (
  startDate: Date,
  endDate: Date
): number => {
  let count = 0;
  const currentDate = new Date(startDate.getTime());
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday(currentDate)) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return count;
};

export const isWeekend = (date: Date): boolean => {
  const dayOfWeek = date.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

export const isHoliday = (date: Date): boolean => {
  const formattedDate = date.toISOString().split("T")[0];
  const rawDate = date.toISOString();
  console.log(
    `isHoliday - Input: raw=${rawDate}, formatted=${formattedDate}, HOLIDAYS_2025=${JSON.stringify(
      HOLIDAYS_2025
    )}, match=${
      HOLIDAYS_2025.some((holiday) => holiday.date === formattedDate)
        ? "yes"
        : "no"
    }`
  );
  return HOLIDAYS_2025.some((holiday) => holiday.date === formattedDate);
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
  // Normalize dates to midnight UTC, ignoring time components
  const normalizeDate = (date: Date): Date => {
    const normalized = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
    );
    console.log(
      `normalizeDate - Input: ${date.toISOString()} -> Normalized: ${normalized.toISOString()}`
    );
    return normalized;
  };

  const normalizedNewStart = normalizeDate(newStartDate);
  const normalizedNewEnd = normalizeDate(newEndDate);

  console.log(
    `checkLeaveOverlap - New leave: ${normalizedNewStart.toISOString()} to ${normalizedNewEnd.toISOString()}`
  );

  for (const leave of existingLeaves) {
    if (
      leave.status === LeaveStatus.Pending ||
      leave.status === LeaveStatus.Approved
    ) {
      const existingStart = normalizeDate(new Date(leave.start_date));
      const existingEnd = normalizeDate(new Date(leave.end_date));
      console.log(
        `Existing leave: raw_start=${leave.start_date.toISOString()}, norm_start=${existingStart.toISOString()}, raw_end=${leave.end_date.toISOString()}, norm_end=${existingEnd.toISOString()}`
      );

      // Subset: new leave fully within existing
      if (
        normalizedNewStart >= existingStart &&
        normalizedNewEnd <= existingEnd
      ) {
        return {
          overlaps: true,
          isSubset: true,
          canMerge: false,
          conflictingLeave: leave,
          message: `Leave already applied from ${existingStart.toLocaleDateString()} to ${existingEnd.toLocaleDateString()}`,
        };
      }
      // Overlap: new leave intersects with existing
      if (
        normalizedNewStart <= existingEnd &&
        normalizedNewEnd >= existingStart
      ) {
        const mergedStart = new Date(
          Math.min(normalizedNewStart.getTime(), existingStart.getTime())
        );
        const mergedEnd = new Date(
          Math.max(normalizedNewEnd.getTime(), existingEnd.getTime())
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
