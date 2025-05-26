import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { User } from "../entity/User";
import { AppDataSource } from "../data-source";

const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_jwt_key";

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: {
  user_id: number;
  role_id: number;
  scope?: string[];
}): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });
};

export const validateCredentials = async (
  email: string,
  password: string
): Promise<User | null> => {
  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { email },
    select: ["user_id", "name", "email", "password_hash", "role_id"],
  });
  if (!user) return null;
  const isValid = await comparePassword(password, user.password_hash);
  return isValid ? user : null;
};
