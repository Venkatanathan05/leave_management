import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import * as jwt from "jsonwebtoken";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Role } from "../entity/Role";
import {
  hashPassword,
  validateCredentials,
  generateToken,
  comparePassword,
} from "../utils/authUtils";

export class AuthController {
  async login(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const { email, password } = request.payload as {
      email: string;
      password: string;
    };
    if (!email || !password) {
      throw Boom.badRequest("Email and password are required");
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const roleRepository = AppDataSource.getRepository(Role);
      const user = await userRepository.findOne({ where: { email } });
      console.log("Login attempt:", { email, userFound: !!user }); // Debug
      if (!user) {
        throw Boom.unauthorized("Invalid email or password");
      }

      const isPasswordValid = await comparePassword(
        password,
        user.password_hash
      );
      console.log("Password valid:", isPasswordValid); // Debug
      if (!isPasswordValid) {
        throw Boom.unauthorized("Invalid email or password");
      }

      const role = await roleRepository.findOne({
        where: { role_id: user.role_id },
      });
      const scope =
        role?.name === "HR"
          ? ["HR"]
          : role?.name === "Manager"
          ? ["Manager"]
          : role?.name === "Admin"
          ? ["Admin"]
          : [];
      console.log("JWT scope:", scope); // Debug
      const token = jwt.sign(
        { user_id: user.user_id, role_id: user.role_id, scope },
        process.env.JWT_SECRET || "your_super_secret_jwt_key",
        { expiresIn: "1d" }
      );

      return h
        .response({
          token,
          user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_id: user.role_id,
            role_name: role?.name || "Unknown",
          },
        })
        .code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error during login:", error);
      throw Boom.internal("Internal server error during login");
    }
  }

  async updateProfile(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const userCredentials = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { email, password } = request.payload as {
      email?: string;
      password?: string;
    };

    if (!email && !password) {
      throw Boom.badRequest(
        "At least one field (email or password) must be provided"
      );
    }

    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { user_id: userCredentials.user_id },
      });
      if (!user) {
        throw Boom.notFound("User not found");
      }

      if (email && email !== user.email) {
        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser) {
          throw Boom.conflict("Email is already in use");
        }
        user.email = email;
      }

      if (password) {
        user.password_hash = await hashPassword(password);
      }

      await userRepository.save(user);
      return h
        .response({
          message: "Profile updated successfully",
          email: user.email,
        })
        .code(200);
    } catch (error) {
      if (Boom.isBoom(error)) throw error;
      console.error("Error updating profile:", error);
      throw Boom.internal("Internal server error updating profile");
    }
  }
}
