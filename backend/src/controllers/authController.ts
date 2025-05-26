import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import { Role } from "../entity/Role";
import {
  hashPassword,
  comparePassword,
  generateToken,
  validateCredentials,
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
      const user = await validateCredentials(email, password);
      console.log("Login attempt:", { email, userFound: !!user });
      if (!user) {
        throw Boom.unauthorized("Invalid email or password");
      }

      const roleRepository = AppDataSource.getRepository(Role);
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
      console.log("JWT scope:", scope);
      const token = generateToken({
        user_id: user.user_id,
        role_id: user.role_id,
        scope,
      });

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
    const { email, oldPassword, newPassword } = request.payload as {
      email?: string;
      oldPassword?: string;
      newPassword?: string;
    };

    if (!email && (!oldPassword || !newPassword)) {
      throw Boom.badRequest("Provide email or both old and new passwords");
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

      if (oldPassword && newPassword) {
        const isValid = await comparePassword(oldPassword, user.password_hash);
        if (!isValid) {
          throw Boom.unauthorized("Incorrect old password");
        }
        user.password_hash = await hashPassword(newPassword);
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
