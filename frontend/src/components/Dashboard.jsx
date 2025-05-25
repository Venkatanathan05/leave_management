import { useAuth } from "../authContext.jsx";
import Balances from "./Balances.jsx";
import LeaveForm from "./LeaveForm.jsx";
import MyLeaves from "./MyLeaves.jsx";
import WelcomeCard from "./WelcomeCard.jsx";
import UserViewCard from "./UserViewCard.jsx";
import LeaveRequests from "./LeaveRequests.jsx";
import "../styles/Dashboard.css";

function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="dashboard-content">
      <h1>{user.role_name} Dashboard</h1>
      <WelcomeCard />
      {user.role_id === 1 && (
        <>
          <UserViewCard />
          <LeaveRequests />
          {/* Admin: User creation form to be implemented */}
          <p>User creation form (to be implemented)</p>
        </>
      )}
      {user.role_id === 5 && (
        <>
          <h2>Leave Request Form</h2>
          <LeaveForm />
          <Balances />
          <MyLeaves />
          <LeaveRequests />
          <UserViewCard />
        </>
      )}
      {user.role_id === 3 && (
        <>
          <h2>Leave Request Form</h2>
          <LeaveForm />
          <Balances />
          <MyLeaves />
          <LeaveRequests />
          <UserViewCard />
        </>
      )}
      {(user.role_id === 2 || user.role_id === 4) && (
        <>
          <LeaveForm />
          <MyLeaves />
        </>
      )}
    </div>
  );
}

export default Dashboard;
