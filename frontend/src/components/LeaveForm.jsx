import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getLeaveTypes, applyLeave } from "../api.js";
import "../styles/LeaveForm.css";

function LeaveForm() {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const fetchLeaveTypes = async () => {
      try {
        const types = await getLeaveTypes();
        setLeaveTypes(types);
        if (types.length > 0) {
          setLeaveTypeId(types[0].leave_type_id);
        }
      } catch {
        setError("Failed to load leave types");
      }
    };
    fetchLeaveTypes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      await applyLeave({
        leave_type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      setSuccess("Leave applied successfully");
      setLeaveTypeId(leaveTypes[0]?.leave_type_id || "");
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to apply leave");
    }
  };

  if (!user) return null;

  return (
    <div className="leave-form-container">
      <h2>Apply for Leave</h2>
      <form onSubmit={handleSubmit} className="leave-form">
        <div className="form-group">
          <label htmlFor="leaveType">Leave Type</label>
          <select
            id="leaveType"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            required
          >
            {leaveTypes.map((type) => (
              <option key={type.leave_type_id} value={type.leave_type_id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="startDate">Start Date</label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="endDate">End Date</label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="reason">Reason</label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
        <button type="submit">Submit</button>
      </form>
    </div>
  );
}

export default LeaveForm;
