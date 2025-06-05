import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AuthController } from "../controllers/authController";

const authController = new AuthController();

const authRoutes: Hapi.ServerRoute[] = [
  {
    method: "POST",
    path: "/api/auth/login",
    handler: (request, h) => authController.login(request, h),
    options: { auth: false },
  },
  {
    method: "PUT",
    path: "/api/auth/profile",
    handler: (request, h) => authController.updateProfile(request, h),
    options: {
      auth: {
        strategy: "jwt",
        scope: ["Admin", "Manager", "Employee", "Intern", "HR"],
      },
    },
  },
  // {
  //   method: "GET",
  //   path: "/api/auth/protected-test",
  //   handler: async (request: Hapi.Request, h: Hapi.ResponseToolkit) => {
  //     const user = request.auth.credentials;
  //     if (!user) {
  //       throw Boom.unauthorized("Not authorized, user info missing");
  //     }
  //     return h
  //       .response({
  //         message: "You accessed a protected route!",
  //         user,
  //       })
  //       .code(200);
  //   },
  //   options: {
  //     auth: {
  //       strategy: "jwt",
  //       scope: ["Admin", "Manager", "Employee", "Intern", "HR"],
  //     },
  //   },
  // },
];

export { authRoutes };
