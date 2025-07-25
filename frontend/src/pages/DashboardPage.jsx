import { useState } from "react";
import { useAuth } from "../auth/authContext.jsx";
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
import MyActions from "../components/MyActions.jsx";
import "../styles/DashboardPage.css";

function DashboardPage() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleApproval = () => {
    setRefreshKey((prev) => prev + 1);
  };

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
            <Route
              path="balances"
              element={<Balances refreshTrigger={refreshKey} />}
            />
            <Route path="my-leaves" element={<MyLeaves />} />
            <Route path="calendar" element={<Calendar />} />

            {(user.role_id === 1 ||
              user.role_id === 3 ||
              user.role_id === 5) && (
              <Route path="my-actions" element={<MyActions />} />
            )}

            {user.role_id === 1 && (
              <>
                <Route path="users" element={<UserViewCard />} />
                <Route
                  path="approvals"
                  element={<LeaveRequests onApproval={handleApproval} />}
                />
                <Route path="user-creation" element={<UserCreationForm />} />
              </>
            )}
            {user.role_id === 5 && (
              <>
                <Route path="users" element={<UserViewCard />} />
                <Route
                  path="approvals"
                  element={<LeaveRequests onApproval={handleApproval} />}
                />
              </>
            )}
            {user.role_id === 3 && (
              <>
                <Route
                  path="team-requests"
                  element={<LeaveRequests onApproval={handleApproval} />}
                />
                <Route path="users" element={<UserViewCard />} />
              </>
            )}
          </Routes>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
