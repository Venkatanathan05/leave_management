import { useAuth } from "../authContext.jsx";
import "../styles/WelcomeCard.css";

function WelcomeCard() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="welcome-card">
      <h3>Welcome, {user.name}!</h3>
      <p>You are logged in as {user.role_name}.</p>
    </div>
  );
}

export default WelcomeCard;
