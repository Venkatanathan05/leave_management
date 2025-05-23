import * as Hapi from "@hapi/hapi";
import * as dotenv from "dotenv";
import { AppDataSource } from "./data-source";
import { authRoutes } from "./routes/authRoutes";
import { leaveRoutes } from "./routes/leaveRoutes";
import { managerRoutes } from "./routes/managerRoutes";
import { adminRoutes } from "./routes/adminRoutes";
import { hrRoutes } from "./routes/hrRoutes";
import * as HapiJwt from "hapi-auth-jwt2";

dotenv.config();

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: "localhost",
    routes: { cors: true },
  });

  // Register JWT authentication
  await server.register(HapiJwt);
  server.auth.strategy("jwt", "jwt", {
    key: process.env.JWT_SECRET || "your_super_secret_jwt_key",
    validate: async (decoded: any) => ({
      isValid: true,
      credentials: { user_id: decoded.user_id, role_id: decoded.role_id },
    }),
  });
  server.auth.default("jwt");

  // Initialize database
  await AppDataSource.initialize();
  console.log("Database connected");

  // Register routes
  server.route([
    ...authRoutes,
    ...leaveRoutes,
    ...managerRoutes,
    ...adminRoutes,
    ...hrRoutes,
  ]);

  // Start server
  await server.start();
  console.log(`Server running on ${server.info.uri}`);
};

process.on("unhandledRejection", (err) => {
  console.error(err);
  process.exit(1);
});

init();
