import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import {
  getHRUsers,
  getTeamUsers,
  getMyLeaves,
  getLeaveBalances,
  getAllUsers,
  deleteUser,
} from "../api.js";
import "../styles/UserViewCard.css";

function UserViewCard() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [showConfirm, setShowConfirm] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        let data;
        if (user.role_id === 5) {
          data = await getHRUsers();
        } else if (user.role_id === 3) {
          data = await getTeamUsers();
        } else if (user.role_id === 1) {
          data = await getAllUsers();
        }
        setUsers(data);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            "Failed to load users. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [user]);

  const handleUserClick = async (userId) => {
    setSelectedUser(userId);
    setError("");
    setLoading(true);
    try {
      const [leaveData, balanceData] = await Promise.all([
        getMyLeaves(userId),
        getLeaveBalances(userId),
      ]);
      setLeaves(leaveData);
      setBalances(balanceData);
    } catch {
      setError("Failed to load user details");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId) => {
    try {
      await deleteUser(userId);
      setUsers(users.filter((u) => u.user_id !== userId));
      if (selectedUser === userId) setSelectedUser(null);
      setShowConfirm(null);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete user");
    }
  };

  if (!user || ![1, 3, 5].includes(user.role_id)) return null;

  return (
    <div className="user-view-card">
      <h2>Users</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
      {users.length > 0 ? (
        <div className="user-list">
          {users.map((u) => (
            <div
              key={u.user_id}
              className={`user-item ${
                selectedUser === u.user_id ? "selected" : ""
              }`}
            >
              <div
                className="user-info"
                onClick={() => handleUserClick(u.user_id)}
              >
                <span>
                  {u.name} ({u.role_name})
                </span>
                <span>{u.email}</span>
              </div>
              {user.role_id === 1 && u.user_id !== user.user_id && (
                <button
                  className="delete-button"
                  onClick={() => setShowConfirm(u.user_id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p>No users available</p>
      )}
      {showConfirm && (
        <div className="confirm-modal">
          <div className="confirm-content">
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete{" "}
              {users.find((u) => u.user_id === showConfirm)?.name}?
            </p>
            <div className="confirm-buttons">
              <button
                className="confirm-button"
                onClick={() => handleDelete(showConfirm)}
              >
                Yes
              </button>
              <button
                className="cancel-button"
                onClick={() => setShowConfirm(null)}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedUser && (
        <div className="user-details">
          <h3>User Details</h3>
          <h4>Leave Balances</h4>
          {balances.length > 0 ? (
            <table className="details-table">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>Available Days</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance, index) => (
                  <tr key={balance.balance_id || `balance-${index}`}>
                    <td>{balance.leaveType?.name || "Unknown"}</td>
                    <td>{balance.available_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No balances available</p>
          )}
          <h4>Leave History</h4>
          {leaves.length > 0 ? (
            <table className="details-table">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>Start Date</th>
                  <th>End Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map((leave, index) => (
                  <tr key={leave.leave_id || `leave-${index}`}>
                    <td>{leave.leaveType?.name || "Unknown"}</td>
                    <td>{new Date(leave.start_date).toLocaleDateString()}</td>
                    <td>{new Date(leave.end_date).toLocaleDateString()}</td>
                    <td>{leave.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No leave requests found</p>
          )}
        </div>
      )}
    </div>
  );
}

export default UserViewCard;
