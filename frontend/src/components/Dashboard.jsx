import { useAuth } from "../authContext.jsx";
import WelcomeCard from "./WelcomeCard.jsx";
import "../styles/Dashboard.css";

function Dashboard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="dashboard-content">
      <h1>{user.role_name} Dashboard</h1>
      <WelcomeCard />
    </div>
  );
}

export default Dashboard;
