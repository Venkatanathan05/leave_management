import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getMyLeaves } from "../api.js";
import "../styles/MyLeaves.css";

function MyLeaves() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLeaves = async () => {
      try {
        const data = await getMyLeaves();
        setLeaves(data);
      } catch {
        setError("Failed to load leave history");
      }
    };
    fetchLeaves();
  }, []);

  if (!user) return null;

  return (
    <div className="myleaves-container">
      <h2>My Leave History</h2>
      {error && <p className="error">{error}</p>}
      {leaves.length > 0 ? (
        <table className="myleaves-table">
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((leave, index) => (
              <tr key={leave.leave_id || `leave-${index}`}>
                <td>{leave.leave_type_name}</td>
                <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                <td>{leave.reason}</td>
                <td>{leave.status}</td>
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
