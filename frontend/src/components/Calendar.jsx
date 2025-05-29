import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../auth/authContext.jsx";
import { getCalendarData } from "../api.js";
import "../styles/Calendar.css";

function Calendar() {
  const { user } = useAuth();
  const [calendarData, setCalendarData] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [error, setError] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const today = useMemo(() => new Date(), []); // Stabilize today

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await getCalendarData({
        period: view,
        date: currentDate.toISOString(),
      });
      if (user.role_id === 3) {
        console.log("Calendar Data for Manager (role_id: 3):", response.data);
      }
      setCalendarData(response.data || []);
      setHolidays(response.holidays || []);
    } catch (err) {
      setError("Failed to load calendar data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user, view, currentDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getDates = useMemo(() => {
    const dates = [];
    const start = new Date(currentDate);
    if (view === "month") {
      start.setDate(1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
      }
    } else {
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
      }
    }
    return dates;
  }, [view, currentDate]);

  const prevPeriod = useCallback(() => {
    const newDate = new Date(currentDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  }, [currentDate, view]);

  const nextPeriod = useCallback(() => {
    const newDate = new Date(currentDate);
    if (view === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  }, [currentDate, view]);

  const getStatusClass = useCallback((leaveType) => {
    switch (leaveType?.toLowerCase()) {
      case "casual leave":
        return "leave-annual";
      case "sick leave":
        return "leave-sick";
      case "wfh":
        return "leave-wfh";
      case "training":
        return "leave-training";
      case "loss of pay":
        return "leave-lop";
      default:
        return "leave-present"; // No leave_type implies presence
    }
  }, []);

  const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;
  const isHoliday = (date) =>
    holidays.some((h) => h.date === date.toISOString().split("T")[0]);

  const canSearch = () =>
    user?.role_id === 1 || user?.role_id === 5 || user?.role_id === 3;

  const filteredData = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.filter((day) => {
      if (!day.users) return false;
      const date = new Date(day.date);
      if (date > today) return false; // No availability data after today
      const matchesSearch = searchQuery
        ? day.users.some((u) => {
            const lowerSearch = searchQuery.toLowerCase();
            if (user.role_id === 1) {
              return u.user_name.toLowerCase().includes(lowerSearch);
            }
            if (user.role_id === 5) {
              return (
                [2, 3, 4].includes(u.user_role_id) &&
                u.user_name.toLowerCase().includes(lowerSearch)
              );
            }
            if (user.role_id === 3) {
              return (
                [2, 4].includes(u.user_role_id) &&
                u.user_name.toLowerCase().includes(lowerSearch)
              );
            }
            return false;
          })
        : true;
      return matchesSearch;
    });
  }, [calendarData, searchQuery, user?.role_id, today]);

  return (
    <div className="calendar-container">
      <h2>{user?.role_id === 3 ? "Team Availability" : "Leave Calendar"}</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
      <div className="calendar-controls">
        <div className="view-toggle">
          <button
            className={view === "month" ? "active" : ""}
            onClick={() => setView("month")}
          >
            Month
          </button>
          <button
            className={view === "week" ? "active" : ""}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
        {canSearch() && (
          <div className="filters">
            <input
              type="text"
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
        <div className="calendar-header">
          <button onClick={prevPeriod}>{"<"}</button>
          <h3>
            {currentDate.toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <button onClick={nextPeriod}>{">"}</button>
        </div>
      </div>
      <div className="calendar-grid">
        {view === "month" &&
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="calendar-day-header">
              {day}
            </div>
          ))}
        {view === "week" &&
          getDates.map((date) => (
            <div key={date.toISOString()} className="calendar-day-header">
              {date.toLocaleDateString("default", {
                weekday: "short",
                day: "numeric",
              })}
            </div>
          ))}
        {view === "month" &&
          getDates[0]?.getDay() > 0 &&
          Array.from({ length: getDates[0].getDay() }).map((_, i) => (
            <div key={`blank-${i}`} className="calendar-day blank"></div>
          ))}
        {getDates.map((date) => {
          const dayData = filteredData.find(
            (d) => new Date(d.date).toDateString() === date.toDateString()
          );
          const isWeekOff = isWeekend(date);
          const isHolidayDay = isHoliday(date);
          const showCounts =
            !isWeekOff &&
            !isHolidayDay &&
            (user?.role_id === 1 || user?.role_id === 5);
          return (
            <div
              key={date.toISOString()}
              className={`calendar-day ${isWeekOff ? "week-off" : ""} ${
                isHolidayDay ? "holiday" : ""
              }`}
            >
              {view === "month" && date.getDate()}
              {dayData?.users?.map((userStatus) => (
                <div
                  key={`${userStatus.user_id}-${date.toISOString()}`}
                  className={`leave-indicator ${getStatusClass(
                    userStatus.leave_type
                  )}`}
                  title={`${userStatus.user_name}: ${
                    userStatus.leave_type || "Present"
                  }`}
                >
                  {view === "week" &&
                    `${userStatus.user_name} (${
                      userStatus.leave_type || "Present"
                    })`}
                </div>
              ))}
              {showCounts && dayData && (
                <div className="count-indicators">
                  <span className="leave-count">
                    <span className="dot leave-dot"></span>
                    {dayData.counts.leave}
                  </span>
                  <span className="present-count">
                    <span className="dot present-dot"></span>
                    {dayData.counts.present}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Calendar;
