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
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/LeaveRequests.css";

function LeaveRequests({ onApproval }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      setError("");
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
      } catch (error) {
        const errorMessage =
          error.response?.data?.error ||
          "Failed to load requests. Please try again.";
        setError(errorMessage);
        toast.error(errorMessage, { position: "top-right" });
      } finally {
        setLoading(false);
      }
    };
    if ([1, 3, 5].includes(user.role_id)) fetchRequests();
  }, [user]);

  const handleApprove = async (leaveId) => {
    try {
      let response;
      if (user.role_id === 5) {
        response = await approveHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        response = await approveManagerLeave(leaveId, "");
      } else if (user.role_id === 1) {
        response = await approveAdminLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
      if (response.toast) {
        toast.success(response.toast.message, { position: "top-right" });
      }
      if (onApproval) onApproval();
    } catch (error) {
      const errorMessage =
        error.response?.data?.error || "Failed to approve request";
      setError(errorMessage);
      toast.error(errorMessage, { position: "top-right" });
    }
  };

  const handleReject = async (leaveId) => {
    try {
      let response;
      if (user.role_id === 5) {
        response = await rejectHRLeave(leaveId, "");
      } else if (user.role_id === 3) {
        response = await rejectManagerLeave(leaveId, "");
      } else if (user.role_id === 1) {
        response = await rejectAdminLeave(leaveId, "");
      }
      setRequests(requests.filter((req) => req.leave_id !== leaveId));
      if (response.toast) {
        toast.error(response.toast.message, { position: "top-right" });
      }
      if (onApproval) onApproval();
    } catch (error) {
      const errorMessage =
        error.response?.data?.error || "Failed to reject request";
      setError(errorMessage);
      toast.error(errorMessage, { position: "top-right" });
    }
  };

  if (!user || ![1, 5, 3].includes(user.role_id)) return null;

  return (
    <div className="leave-requests">
      <h2>Pending Leave Requests</h2>
      <ToastContainer />
      {loading && <p>Loading...</p>}
      {error && <p className="error">{error}</p>}
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
        !loading && !error && <p className="info">No pending requests</p>
      )}
    </div>
  );
}

export default LeaveRequests;
