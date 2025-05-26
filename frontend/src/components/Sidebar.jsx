import { useAuth } from "../auth/authContext.jsx";
import { Link } from "react-router-dom";
import "../styles/Sidebar.css";

function Sidebar() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <aside className="sidebar">
      <h3>Welcome, {user.name}</h3>
      <nav>
        <ul>
          {(user.role_id === 2 ||
            user.role_id === 4 ||
            user.role_id === 3 ||
            user.role_id === 5) && (
            <>
              <li>
                <Link to="/dashboard/apply-leave">Apply Leave</Link>
              </li>
              <li>
                <Link to="/dashboard/balances">Balances</Link>
              </li>
              <li>
                <Link to="/dashboard/my-leaves">My Leaves</Link>
              </li>
            </>
          )}
          <li>
            <Link to="/dashboard/calendar">Calendar</Link>
          </li>
          <li>
            <Link to="/dashboard/profile">Profile</Link>
          </li>
          {user.role_id === 1 && (
            <>
              <li>
                <Link to="/dashboard/users">Users</Link>
              </li>
              <li>
                <Link to="/dashboard/user-creation">User Creation</Link>
              </li>
              <li>
                <Link to="/dashboard/approvals">Approvals</Link>
              </li>
            </>
          )}
          {user.role_id === 5 && (
            <>
              <li>
                <Link to="/dashboard/users">Users</Link>
              </li>
              <li>
                <Link to="/dashboard/approvals">Leave Requests</Link>
              </li>
            </>
          )}
          {user.role_id === 3 && (
            <>
              <li>
                <Link to="/dashboard/team-requests">Team Requests</Link>
              </li>
              <li>
                <Link to="/dashboard/users">Users</Link>
              </li>
            </>
          )}
        </ul>
      </nav>
    </aside>
  );
}

export default Sidebar;
