import * as Hapi from "@hapi/hapi";
import * as Jwt from "@hapi/jwt";
import { adminRoutes } from "./routes/adminRoutes";
import { authRoutes } from "./routes/authRoutes";
import { hrRoutes } from "./routes/hrRoutes";
import { leaveRoutes } from "./routes/leaveRoutes";
import { managerRoutes } from "./routes/managerRoutes";
import { AppDataSource } from "./data-source";

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 5000,
    host: "localhost",
    routes: {
      cors: {
        origin: ["http://localhost:5173"],
        headers: ["Accept", "Authorization", "Content-Type", "If-None-Match"],
        additionalHeaders: ["cache-control", "x-requested-with"],
      },
    },
  });

  await server.register(Jwt);

  server.auth.strategy("jwt", "jwt", {
    keys: process.env.JWT_SECRET || "your_super_secret_jwt_key",
    verify: {
      aud: false,
      iss: false,
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec: 24 * 60 * 60, // 1 day
      timeSkewSec: 15,
    },
    validate: (artifacts, request, h) => {
      console.log("JWT validate:", {
        user_id: artifacts.decoded.payload.user_id,
        role_id: artifacts.decoded.payload.role_id,
        scope: artifacts.decoded.payload.scope,
      }); // Debug
      return {
        isValid: true,
        credentials: {
          user_id: artifacts.decoded.payload.user_id,
          role_id: artifacts.decoded.payload.role_id,
          scope: artifacts.decoded.payload.scope,
        },
      };
    },
  });

  server.auth.default("jwt");

  server.route([
    ...adminRoutes,
    ...authRoutes,
    ...hrRoutes,
    ...leaveRoutes,
    ...managerRoutes,
  ]);

  await AppDataSource.initialize();
  await server.start();
  console.log(`Server running on ${server.info.uri}`);
};

process.on("unhandledRejection", (err) => {
  console.error(err);
  process.exit(1);
});

init();
