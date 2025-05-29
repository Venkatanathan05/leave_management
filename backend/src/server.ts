import * as Hapi from "@hapi/hapi";
import * as Jwt from "@hapi/jwt";
import * as Inert from "@hapi/inert"; // <-- Added
import { adminRoutes } from "./routes/adminRoutes";
import { authRoutes } from "./routes/authRoutes";
import { hrRoutes } from "./routes/hrRoutes";
import { leaveRoutes } from "./routes/leaveRoutes";
import { managerRoutes } from "./routes/managerRoutes";
import { AppDataSource } from "./data-source";

const init = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 5001,
    host: "localhost",
    routes: {
      cors: {
        origin: ["http://localhost:5173"],
        headers: ["Accept", "Authorization", "Content-Type", "If-None-Match"],
        additionalHeaders: ["cache-control", "x-requested-with"],
        credentials: true,
      },
      payload: {
        maxBytes: 10485760, // 10MB
        parse: true,
        multipart: { output: "stream" }, // <--- Required for file upload
      },
    },
  });

  await server.register([Jwt, Inert]);

  server.auth.strategy("jwt", "jwt", {
    keys: process.env.JWT_SECRET || "your_super_secret_jwt_key",
    verify: {
      aud: false,
      iss: false,
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec: 24 * 60 * 60,
      timeSkewSec: 15,
    },
    validate: (artifacts, request, h) => {
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

  server.ext("onPreAuth", (request, h) => {
    if (request.method === "options") {
      return h.continue;
    }
    return h.continue;
  });

  server.auth.default("jwt");

  server.route([
    ...adminRoutes,
    ...authRoutes,
    ...hrRoutes,
    ...leaveRoutes,
    ...managerRoutes,
    // Add bulkUploadRoutes after implementation
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
