import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getCalendarData, getHolidays } from "../api.js";
import "../styles/Calendar.css";

function Calendar() {
  const { user } = useAuth();
  const [calendarData, setCalendarData] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [error, setError] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [roleFilter, setRoleFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const roles = ["Employee", "Intern", "Manager", "HR"];

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [calendarResponse, holidaysResponse] = await Promise.all([
          getCalendarData({ period: view, date: currentDate.toISOString() }),
          getHolidays(),
        ]);
        setCalendarData(calendarResponse.data);
        setHolidays(holidaysResponse);
      } catch {
        setError("Failed to load calendar data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, view, currentDate]);

  const getDates = () => {
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
  };

  const prevPeriod = () => {
    const newDate = new Date(currentDate);
    if (view === "month") newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextPeriod = () => {
    const newDate = new Date(currentDate);
    if (view === "month") newDate.setMonth(newDate.getMonth() + 1);
    else newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const getLeaveTypeClass = (leaveType) => {
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
        return "";
    }
  };

  const isWeekend = (date) => date.getDay() === 0 || date.getDay() === 6;
  const isHoliday = (date) =>
    holidays.some((h) => h.date === date.toISOString().split("T")[0]);

  const filteredData = calendarData.filter((day) => {
    if (!day.leaves) return false;
    const matchesRole = roleFilter
      ? day.leaves.some((l) => l.role_name === roleFilter)
      : true;
    const matchesSearch = searchQuery
      ? day.leaves.some((l) =>
          l.user_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : true;
    return matchesRole && matchesSearch;
  });

  const dates = getDates();

  return (
    <div className="calendar-container">
      <h2>{user.role_id === 3 ? "Team Availability" : "Leave Calendar"}</h2>
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
        {(user.role_id === 3 || user.role_id === 5 || user.role_id === 1) && (
          <div className="filters">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
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
          dates.map((date) => (
            <div key={date.toISOString()} className="calendar-day-header">
              {date.toLocaleDateString("default", {
                weekday: "short",
                day: "numeric",
              })}
            </div>
          ))}
        {view === "month" &&
          dates[0].getDay() > 0 &&
          Array.from({ length: dates[0].getDay() }).map((_, i) => (
            <div key={`blank-${i}`} className="calendar-day blank"></div>
          ))}
        {dates.map((date) => {
          const dayData = filteredData.find(
            (d) => new Date(d.date).toDateString() === date.toDateString()
          );
          const isWeekOff = isWeekend(date);
          const isHolidayDay = isHoliday(date);
          return (
            <div
              key={date.toISOString()}
              className={`calendar-day ${isWeekOff ? "week-off" : ""} ${
                isHolidayDay ? "holiday" : ""
              }`}
            >
              {view === "month" && date.getDate()}
              {dayData?.leaves.map((leave) => (
                <div
                  key={`${leave.user_id}-${date.toISOString()}`}
                  className={`leave-indicator ${getLeaveTypeClass(
                    leave.leave_type
                  )}`}
                  title={`${leave.user_name}: ${leave.leave_type}`}
                >
                  {view === "week" &&
                    `${leave.user_name} (${leave.leave_type})`}
                </div>
              ))}
              {(user.role_id === 1 || user.role_id === 5) && dayData && (
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
