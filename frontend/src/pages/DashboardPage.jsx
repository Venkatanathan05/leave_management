import { useAuth } from "../authContext.jsx";
import { Navigate, Routes, Route } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";
import Sidebar from "../components/Sidebar.jsx";
import Dashboard from "../components/Dashboard.jsx";
import LeaveForm from "../components/LeaveForm.jsx";
import Balances from "../components/Balances.jsx";
import MyLeaves from "../components/MyLeaves.jsx";
import Calendar from "../components/Calendar.jsx";
import UserViewCard from "../components/UserViewCard.jsx";
import LeaveRequests from "../components/LeaveRequests.jsx";
import UserCreationForm from "../components/UserCreationForm.jsx";
import ProfilePage from "../components/ProfilePage.jsx";
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
            <Route path="profile" element={<ProfilePage />} />
            <Route path="apply-leave" element={<LeaveForm />} />
            <Route path="balances" element={<Balances />} />
            <Route path="my-leaves" element={<MyLeaves />} />
            <Route path="calendar" element={<Calendar />} />
            {user.role_id === 1 && (
              <>
                <Route path="users" element={<UserViewCard />} />
                <Route path="approvals" element={<LeaveRequests />} />
                <Route path="user-creation" element={<UserCreationForm />} />
              </>
            )}
            {user.role_id === 5 && (
              <>
                <Route path="users" element={<UserViewCard />} />
                <Route path="approvals" element={<LeaveRequests />} />
              </>
            )}
            {user.role_id === 3 && (
              <>
                <Route path="team-requests" element={<LeaveRequests />} />
                <Route path="users" element={<UserViewCard />} />
              </>
            )}
            {/* Remove placeholder routes */}
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
