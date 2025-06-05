import { useState, useEffect } from "react";
import { useAuth } from "../auth/authContext.jsx";
import { getMyLeaves } from "../api.js";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/MyLeaves.css";

function MyLeaves() {
  const { user } = useAuth();
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaves = async () => {
      setLoading(true);
      try {
        const data = await getMyLeaves();
        setLeaveHistory(data);
      } catch (error) {
        const errorMessage =
          error.response?.data?.error || "Failed to load leave history";
        setError(errorMessage);
        toast.error(errorMessage, { position: "top-right" });
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchLeaves();
  }, [user]);

  const getApprovalStatus = (approvals) => {
    const approverActions = {};
    approvals.forEach((approval) => {
      if (
        !approverActions[approval.approver_id] ||
        (approval.action !== "Pending" &&
          approverActions[approval.approver_id].action === "Pending")
      ) {
        approverActions[approval.approver_id] = approval;
      }
    });

    return Object.values(approverActions)
      .map((approval) => {
        const role =
          approval.approver_role_id === 5
            ? "HR"
            : approval.approver_role_id === 3
            ? "Manager"
            : "Admin";
        return `${role}: ${approval.action}`;
      })
      .join(", ");
  };

  if (!user) return null;

  return (
    <div className="myleaves-container">
      <h2>My Leave History</h2>
      <ToastContainer />
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
      {leaveHistory.length > 0 ? (
        <table className="myleaves-table">
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Approvals</th>
            </tr>
          </thead>
          <tbody>
            {leaveHistory.map((leave, index) => (
              <tr key={leave.leave_id || `leave-${index}`}>
                <td>{leave.leaveType?.name || "Unknown"}</td>
                <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                <td>{leave.reason}</td>
                <td>{leave.status}</td>
                <td>
                  {leave.approvals?.length > 0
                    ? getApprovalStatus(leave.approvals)
                    : "None"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !loading && !error && <p>No leave requests found</p>
      )}
    </div>
  );
}

export default MyLeaves;
