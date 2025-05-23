import { AppDataSource } from "../data-source";
import { User } from "../entity/User";
import * as Hapi from "@hapi/hapi";
import * as Boom from "@hapi/boom";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { hashPassword } from "../utils/authUtils"; // Assume exists
import * as dotenv from "dotenv";

dotenv.config();

const userRepository = AppDataSource.getRepository(User);

export class AuthController {
  async login(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const { email, password } = request.payload as {
      email: string;
      password: string;
    };

    try {
      const user = await userRepository.findOne({
        where: { email },
        relations: ["role"],
      });

      if (!user) {
        throw Boom.unauthorized("Invalid email or password");
      }

      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw Boom.unauthorized("Invalid email or password");
      }

      const token = jwt.sign(
        { user_id: user.user_id, role_id: user.role_id },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      return h
        .response({
          token,
          user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            role_id: user.role_id,
            role_name: user.role.name,
          },
        })
        .code(200);
    } catch (error) {
      console.error("Error during login:", error);
      throw Boom.internal("Internal server error during login");
    }
  }

  async updateProfile(request: Hapi.Request, h: Hapi.ResponseToolkit) {
    const user = request.auth.credentials as {
      user_id: number;
      role_id: number;
    };
    const { email, password } = request.payload as {
      email?: string;
      password?: string;
    };

    try {
      const targetUser = await userRepository.findOne({
        where: { user_id: user.user_id },
      });

      if (!targetUser) {
        throw Boom.notFound("User not found");
      }

      if (email) {
        const existingUser = await userRepository.findOne({ where: { email } });
        if (existingUser && existingUser.user_id !== user.user_id) {
          throw Boom.conflict("Email already in use");
        }
        targetUser.email = email;
      }

      if (password) {
        targetUser.password = await hashPassword(password);
      }

      await userRepository.save(targetUser);
      return h.response({ message: "Profile updated successfully" }).code(200);
    } catch (error) {
      console.error("Error updating profile:", error);
      throw Boom.internal("Internal server error updating profile");
    }
  }
}
