import { useState, useEffect } from "react";
import { useAuth } from "../auth/authContext.jsx";
import {
  getHRPendingRequests,
  approveHRLeave,
  rejectHRLeave,
  getManagerPendingRequests,
  approveManagerLeave,
  rejectManagerLeave,
  getAdminPendingRequests,
  approveAdminLeave,
  rejectAdminLeave,
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
        let data = [];
        if (user.role_id === 5) {
          data = await getHRPendingRequests();
        } else if (user.role_id === 3) {
          data = await getManagerPendingRequests();
        } else if (user.role_id === 1) {
          data = await getAdminPendingRequests();
        }
        setRequests(data);
        setError(data.length === 0 ? "No pending requests" : "");
      } catch {
        setError("Failed to load requests. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    if ([1, 3, 5].includes(user.role_id)) fetchRequests();
  }, [user]);

  const handleApprove = async (leaveId) => {
    try {
      if (user.role_id === 5) {
        await approveHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        await approveManagerLeave(leaveId, "");
      } else if (user.role_id === 1) {
        await approveAdminLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
    } catch {
      setError("Failed to approve request");
    }
  };

  const handleReject = async (leaveId) => {
    try {
      if (user.role_id === 5) {
        await rejectHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        await rejectManagerLeave(leaveId, "");
      } else if (user.role_id === 1) {
        await rejectAdminLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
    } catch {
      setError("Failed to reject request");
    }
  };

  if (!user || ![1, 5, 3].includes(user.role_id)) return null;

  return (
    <div className="leave-requests">
      <h2>Pending Leave Requests</h2>
      {error && (
        <p className={error === "No pending requests" ? "info" : "error"}>
          {error}
        </p>
      )}
      {loading && <p>Loading...</p>}
      {requests.length > 0 ? (
        <table className="requests-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Leave Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.leave_id}>
                <td>{req.user?.name || "Unknown"}</td>
                <td>{req.leaveType?.name || "Unknown"}</td>
                <td>{new Date(req.start_date).toLocaleDateString()}</td>
                <td>{new Date(req.end_date).toLocaleDateString()}</td>
                <td>{req.status}</td>
                <td>
                  <button onClick={() => handleApprove(req.leave_id)}>
                    Approve
                  </button>
                  <button onClick={() => handleReject(req.leave_id)}>
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !loading && <p className="info">No pending requests</p>
      )}
    </div>
  );
}

export default LeaveRequests;
