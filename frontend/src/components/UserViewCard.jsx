import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import {
  getHRUsers,
  getTeamUsers,
  getMyLeaves,
  getLeaveBalances,
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

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        let data;
        if (user.role_id === 5) {
          data = await getHRUsers(); // Employees, Managers, Interns
        } else if (user.role_id === 3) {
          data = await getTeamUsers(); // Employees under Manager
        } else if (user.role_id === 1) {
          // Admin: getAllUsers (to be implemented)
          data = [];
        }
        setUsers(data);
      } catch {
        setError("Failed to load users");
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
        getMyLeaves(userId), // Assumes endpoint supports userId
        getLeaveBalances(userId), // Assumes endpoint supports userId
      ]);
      setLeaves(leaveData);
      setBalances(balanceData);
    } catch {
      setError("Failed to load user details");
    } finally {
      setLoading(false);
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
              onClick={() => handleUserClick(u.user_id)}
            >
              <span>
                {u.name} ({u.role_name})
              </span>
              <span>{u.email}</span>
            </div>
          ))}
        </div>
      ) : (
        <p>No users available</p>
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
