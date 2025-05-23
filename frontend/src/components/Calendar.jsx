import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getLeaveAvailability } from "../api.js";
import "../styles/Calendar.css";

function Calendar() {
  const { user } = useAuth();
  const [leaveDates, setLeaveDates] = useState([]);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const fetchLeaveAvailability = async () => {
      try {
        const data = await getLeaveAvailability();
        setLeaveDates(data);
      } catch {
        setError("Failed to load calendar data");
      }
    };
    fetchLeaveAvailability();
  }, []);

  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();
  const firstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const prevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
    );
  };

  const nextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    );
  };

  const isLeaveDay = (day) => {
    const dateStr = `${currentMonth.getFullYear()}-${String(
      currentMonth.getMonth() + 1
    ).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return leaveDates.some((leave) => leave.date === dateStr);
  };

  if (!user) return null;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  return (
    <div className="calendar-container">
      <h2>Leave Calendar</h2>
      {error && <p className="error">{error}</p>}
      <div className="calendar-header">
        <button onClick={prevMonth}>&lt;</button>
        <h3>
          {currentMonth.toLocaleString("default", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        <button onClick={nextMonth}>&gt;</button>
      </div>
      <div className="calendar-grid">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="calendar-day-header">
            {day}
          </div>
        ))}
        {blanks.map((_, i) => (
          <div key={`blank-${i}`} className="calendar-day blank"></div>
        ))}
        {days.map((day) => (
          <div
            key={day}
            className={`calendar-day ${isLeaveDay(day) ? "leave-day" : ""}`}
          >
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Calendar;
