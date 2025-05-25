import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import {
  approveHRLeave,
  rejectHRLeave,
  approveManagerLeave,
  rejectManagerLeave,
} from "../api.js";
import "../styles/LeaveRequests.css";

function LeaveRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        // Placeholder: Assumes /api/hr/pending-requests or /api/manager/pending-requests
        const response = await fetch(
          `/api/${user.role_id === 5 ? "hr" : "manager"}/pending-requests`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );
        const data = await response.json();
        setRequests(data);
      } catch {
        setError("Failed to load leave requests");
      } finally {
        setLoading(false);
      }
    };
    if ([3, 5].includes(user.role_id)) {
      fetchRequests();
    }
  }, [user]);

  const handleApprove = async (leaveId) => {
    setError("");
    setLoading(true);
    try {
      if (user.role_id === 5) {
        await approveHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        await approveManagerLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
    } catch {
      setError("Failed to approve leave");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (leaveId) => {
    setError("");
    setLoading(true);
    try {
      if (user.role_id === 5) {
        await rejectHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        await rejectManagerLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
    } catch {
      setError("Failed to reject leave");
    } finally {
      setLoading(false);
    }
  };

  if (!user || ![3, 5].includes(user.role_id)) return null;

  return (
    <div className="leave-requests">
      <h2>Leave Requests</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
      {requests.length > 0 ? (
        <table className="requests-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Leave Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req, index) => (
              <tr key={req.leave_id || `req-${index}`}>
                <td>{req.user?.name || "Unknown"}</td>
                <td>{req.leaveType?.name || "Unknown"}</td>
                <td>{new Date(req.start_date).toLocaleDateString()}</td>
                <td>{new Date(req.end_date).toLocaleDateString()}</td>
                <td>{req.reason}</td>
                <td>
                  <button
                    className="approve-btn"
                    onClick={() => handleApprove(req.leave_id)}
                    disabled={loading}
                  >
                    Approve
                  </button>
                  <button
                    className="reject-btn"
                    onClick={() => handleReject(req.leave_id)}
                    disabled={loading}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No pending requests</p>
      )}
    </div>
  );
}

export default LeaveRequests;
