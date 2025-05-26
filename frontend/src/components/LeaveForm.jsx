import { useState, useEffect } from "react";
import { useAuth } from "../auth/authContext.jsx";
import {
  getLeaveTypes,
  applyLeave,
  getMyLeaves,
  checkLeaveOverlap,
} from "../api.js";
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaveTypes = async () => {
      setLoading(true);
      try {
        const types = await getLeaveTypes();
        setLeaveTypes(types);
        if (types.length > 0) {
          setLeaveTypeId(types[0].type_id);
        }
      } catch {
        setError("Failed to load leave types");
      } finally {
        setLoading(false);
      }
    };
    fetchLeaveTypes();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const existingLeaves = await getMyLeaves();
      const overlapResult = existingLeaves.reduce(
        (result, leave) => {
          if (result.overlaps) return result;
          return checkLeaveOverlap(new Date(startDate), new Date(endDate), [
            {
              start_date: leave.start_date,
              end_date: leave.end_date,
              status: leave.status,
            },
          ]);
        },
        { overlaps: false, isSubset: false, canMerge: false }
      );

      if (overlapResult.overlaps) {
        throw new Error(
          overlapResult.message ||
            "Selected dates overlap with an existing leave"
        );
      }

      await applyLeave({
        type_id: leaveTypeId,
        start_date: startDate,
        end_date: endDate,
        reason,
      });
      setSuccess("Leave applied successfully");
      setLeaveTypeId(leaveTypes[0]?.type_id || "");
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (err) {
      setError(
        err.response?.data?.message || err.message || "Failed to apply leave"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="leave-form-container">
      <h2>Apply for Leave</h2>
      {loading && <p>Loading...</p>}
      <form onSubmit={handleSubmit} className="leave-form">
        <div className="form-group">
          <label htmlFor="leaveType">Leave Type</label>
          <select
            id="leaveType"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            required
            disabled={user.role_id === 4 && leaveTypes.length === 1}
          >
            {leaveTypes.map((type) => (
              <option key={type.type_id} value={type.type_id}>
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
        <button type="submit" disabled={loading}>
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
    </div>
  );
}

export default LeaveForm;
