import { useAuth } from "../authContext.jsx";
import { Navigate, Routes, Route, Link } from "react-router-dom";
import AdminDashboard from "../components/AdminDashboard.jsx";
import ManagerDashboard from "../components/ManagerDashboard.jsx";
import EmployeeDashboard from "../components/EmployeeDashboard.jsx";
import LeaveForm from "../components/LeaveForm.jsx";
import Balances from "../components/Balances.jsx";
import MyLeaves from "../components/MyLeaves.jsx";
import Calendar from "../components/Calendar.jsx";
import "../styles/Dashboard.css";

function DashboardPage() {
  const { user, logout } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  const handleLogout = () => {
    logout();
  };

  let DashboardComponent;
  switch (user.role_id) {
    case 1:
      DashboardComponent = AdminDashboard;
      break;
    case 3:
      DashboardComponent = ManagerDashboard;
      break;
    case 2:
    case 4:
      DashboardComponent = EmployeeDashboard;
      break;
    default:
      return <Navigate to="/login" />;
  }

  return (
    <div className="dashboard-container">
      <div className="sidebar">
        <h3>Welcome, {user.name}</h3>
        <nav>
          <ul>
            {user.role_id === 1 && (
              <>
                <li>
                  <Link to="#users">Users</Link>
                </li>
                <li>
                  <Link to="#leave-types">Leave Types</Link>
                </li>
                <li>
                  <Link to="#approvals">Approvals</Link>
                </li>
              </>
            )}
            {user.role_id === 3 && (
              <>
                <li>
                  <Link to="#team-requests">Team Requests</Link>
                </li>
                <li>
                  <Link to="/dashboard/my-leaves">My Leaves</Link>
                </li>
                <li>
                  <Link to="/dashboard/balances">Balances</Link>
                </li>
                <li>
                  <Link to="/dashboard/apply-leave">Apply Leave</Link>
                </li>
              </>
            )}
            {(user.role_id === 2 || user.role_id === 4) && (
              <>
                <li>
                  <Link to="/dashboard/apply-leave">Apply Leave</Link>
                </li>
                <li>
                  <Link to="/dashboard/my-leaves">My Leaves</Link>
                </li>
                <li>
                  <Link to="/dashboard/balances">Balances</Link>
                </li>
              </>
            )}
            <li>
              <Link to="/dashboard/calendar">Calendar</Link>
            </li>
            <li>
              <button onClick={handleLogout}>Logout</button>
            </li>
          </ul>
        </nav>
      </div>
      <div className="content">
        <Routes>
          <Route path="/" element={<DashboardComponent />} />
          {(user.role_id === 2 || user.role_id === 4) && (
            <>
              <Route path="apply-leave" element={<LeaveForm />} />
              <Route path="balances" element={<Balances />} />
              <Route path="my-leaves" element={<MyLeaves />} />
            </>
          )}
          {user.role_id === 3 && (
            <>
              <Route path="apply-leave" element={<LeaveForm />} />
              <Route path="balances" element={<Balances />} />
              <Route path="my-leaves" element={<MyLeaves />} />
            </>
          )}
          <Route path="calendar" element={<Calendar />} />
        </Routes>
      </div>
    </div>
  );
}

export default DashboardPage;
