import React, { useState, useEffect } from "react";
import { getMyActions } from "../api";
import { useAuth } from "../auth/authContext";
import { ShieldCheck, ShieldX } from "lucide-react";
import "../styles/MyActions.css";

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const MyActions = () => {
  const { user } = useAuth();
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const roleName =
    {
      1: "Admin",
      3: "Manager",
      5: "HR",
    }[user.role_id] || "User";

  useEffect(() => {
    if (!user) return;

    const fetchActions = async () => {
      try {
        setLoading(true);
        const response = await getMyActions(user.role_id);
        setActions(response);
      } catch (err) {
        setError("Failed to fetch your actions. Please try again later.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchActions();
  }, [user]);

  if (loading) {
    return (
      <div className="actions-container">
        <p>Loading your actions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="actions-container">
        <p className="error">{error}</p>
      </div>
    );
  }

  return (
    <div className="actions-container">
      <h2>My Action History ({roleName})</h2>
      {actions.length === 0 ? (
        <p>You have not taken any approval actions yet.</p>
      ) : (
        <div className="actions-table-wrapper">
          <table className="actions-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Leave Type</th>
                <th>Leave Dates</th>
                <th>My Decision</th>
                <th>Decision Date</th>
                <th>My Comments</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.approval_id}>
                  <td>{action.leave.user.name}</td>
                  <td>{action.leave.leaveType.name}</td>
                  <td>
                    {formatDate(action.leave.start_date)} -{" "}
                    {formatDate(action.leave.end_date)}
                  </td>
                  <td>
                    {action.action === "Approved" ? (
                      <span className="decision-badge approved">
                        <ShieldCheck size={16} /> Approved
                      </span>
                    ) : (
                      <span className="decision-badge rejected">
                        <ShieldX size={16} /> Rejected
                      </span>
                    )}
                  </td>
                  <td>{formatDate(action.approved_at)}</td>
                  <td className="comments-cell">{action.comments || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyActions;
