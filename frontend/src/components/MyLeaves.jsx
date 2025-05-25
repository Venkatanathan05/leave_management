import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getMyLeaves } from "../api.js";
import "../styles/MyLeaves.css";

function MyLeaves() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaves = async () => {
      setLoading(true);
      try {
        const data = await getMyLeaves();
        setLeaves(data);
      } catch {
        setError("Failed to load leave history");
      } finally {
        setLoading(false);
      }
    };
    fetchLeaves();
  }, []);

  if (!user) return null;

  return (
    <div className="myleaves-container">
      <h2>My Leave History</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
      {leaves.length > 0 ? (
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
            {leaves.map((leave, index) => (
              <tr key={leave.leave_id || `leave-${index}`}>
                <td>{leave.leaveType?.name || "Unknown"}</td>
                <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                <td>{leave.reason}</td>
                <td>{leave.status}</td>
                <td>
                  {leave.approvals?.map((approval, idx) => (
                    <span key={idx}>
                      {approval.approver_role_id === 5
                        ? "HR"
                        : approval.approver_role_id === 3
                        ? "Manager"
                        : "Admin"}
                      : {approval.action}
                      {idx < leave.approvals.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No leave requests found</p>
      )}
    </div>
  );
}

export default MyLeaves;
