import { useAuth } from "../authContext.jsx";
import { Navigate, Routes, Route } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Sidebar from "../components/Sidebar.jsx";
import Dashboard from "../components/Dashboard.jsx";
import LeaveForm from "../components/LeaveForm.jsx";
import Balances from "../components/Balances.jsx";
import MyLeaves from "../components/MyLeaves.jsx";
import Calendar from "../components/Calendar.jsx";
import "../styles/DashboardPage.css";

function DashboardPage() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="dashboard-page">
      <Navbar />
      <div className="dashboard-layout">
        <Sidebar />
        <div className="dashboard-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="apply-leave" element={<LeaveForm />} />
            <Route path="balances" element={<Balances />} />
            <Route path="my-leaves" element={<MyLeaves />} />
            <Route path="calendar" element={<Calendar />} />
            {/* Placeholder routes for Admin/HR/Manager */}
            <Route
              path="users"
              element={<div>Users (to be implemented)</div>}
            />
            <Route
              path="leave-types"
              element={<div>Leave Types (to be implemented)</div>}
            />
            <Route
              path="approvals"
              element={<div>Approvals (to be implemented)</div>}
            />
            <Route
              path="team-requests"
              element={<div>Team Requests (to be implemented)</div>}
            />
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
