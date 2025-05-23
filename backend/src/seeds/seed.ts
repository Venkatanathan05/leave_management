import { DataSource } from "typeorm";
import { Seeder, runSeeder } from "typeorm-extension";
import { Role } from "../entity/Role";
import { User } from "../entity/User";
import { LeaveType } from "../entity/LeaveType";
import { LeaveBalance } from "../entity/LeaveBalance";
import * as bcrypt from "bcryptjs";
import {
  roleInitialBalances,
  ADMIN_ROLE_ID,
  MANAGER_ROLE_ID,
  EMPLOYEE_ROLE_ID,
  INTERN_ROLE_ID,
  HR_ROLE_ID,
} from "../constants";
import { AppDataSource } from "../data-source";

export default class MainSeeder implements Seeder {
  public async run(dataSource: DataSource): Promise<void> {
    try {
      console.log("Starting database seeding...");

      const roleRepository = dataSource.getRepository(Role);
      const userRepository = dataSource.getRepository(User);
      const leaveTypeRepository = dataSource.getRepository(LeaveType);
      const leaveBalanceRepository = dataSource.getRepository(LeaveBalance);

      // Seed Roles
      const roles = [
        { role_id: ADMIN_ROLE_ID, name: "Admin" },
        { role_id: EMPLOYEE_ROLE_ID, name: "Employee" },
        { role_id: MANAGER_ROLE_ID, name: "Manager" },
        { role_id: INTERN_ROLE_ID, name: "Intern" },
        { role_id: HR_ROLE_ID, name: "HR" },
      ];
      const existingRoles = await roleRepository.find();
      const rolesToSave = roles.filter(
        (role) =>
          !existingRoles.some((existing) => existing.role_id === role.role_id)
      );
      if (rolesToSave.length > 0) {
        await roleRepository.save(rolesToSave);
        console.log(`Seeded ${rolesToSave.length} roles successfully.`);
      } else {
        console.log("No new roles to seed.");
      }

      // Seed Leave Types
      const leaveTypes = [
        {
          name: "Casual Leave",
          requires_approval: true,
          is_balance_based: true,
        },
        { name: "Sick Leave", requires_approval: true, is_balance_based: true },
        {
          name: "Loss of Pay",
          requires_approval: true,
          is_balance_based: false,
        },
      ];
      const existingLeaveTypes = await leaveTypeRepository.find();
      const leaveTypesToSave = leaveTypes.filter(
        (lt) =>
          !existingLeaveTypes.some((existing) => existing.name === lt.name)
      );
      if (leaveTypesToSave.length > 0) {
        await leaveTypeRepository.save(leaveTypesToSave);
        console.log(
          `Seeded ${leaveTypesToSave.length} leave types successfully.`
        );
      } else {
        console.log("No new leave types to seed.");
      }

      // Seed Users
      const passwordHash = await bcrypt.hash("password123", 10);
      const users = [
        {
          name: "Admin User",
          email: "admin@example.com",
          password_hash: passwordHash,
          role_id: ADMIN_ROLE_ID,
        },
        {
          name: "Manager User",
          email: "manager@example.com",
          password_hash: passwordHash,
          role_id: MANAGER_ROLE_ID,
        },
        {
          name: "Employee User",
          email: "employee@example.com",
          password_hash: passwordHash,
          role_id: EMPLOYEE_ROLE_ID,
          manager_id: 2,
        },
        {
          name: "Intern User",
          email: "intern@example.com",
          password_hash: passwordHash,
          role_id: INTERN_ROLE_ID,
          manager_id: 2,
        },
        {
          name: "HR User",
          email: "hr@example.com",
          password_hash: passwordHash,
          role_id: HR_ROLE_ID,
        },
      ];
      const existingUsers = await userRepository.find();
      const usersToSave = users.filter(
        (user) =>
          !existingUsers.some((existing) => existing.email === user.email)
      );
      let savedUsers = existingUsers;
      if (usersToSave.length > 0) {
        savedUsers = await userRepository.save(usersToSave);
        console.log(`Seeded ${usersToSave.length} users successfully.`);
      } else {
        console.log("No new users to seed.");
      }

      // Seed Leave Balances
      const currentYear = new Date().getFullYear();
      const savedLeaveTypes = await leaveTypeRepository.find();
      const existingBalances = await leaveBalanceRepository.find();
      const balances: LeaveBalance[] = [];
      for (const user of savedUsers) {
        const balancesToCreate = roleInitialBalances[user.role_id] || [];
        for (const rule of balancesToCreate) {
          const leaveType = savedLeaveTypes.find(
            (lt) => lt.name === rule.leaveTypeName
          );
          if (
            leaveType &&
            !existingBalances.some(
              (eb) =>
                eb.user_id === user.user_id &&
                eb.type_id === leaveType.type_id &&
                eb.year === currentYear
            )
          ) {
            const newBalance = new LeaveBalance();
            newBalance.user_id = user.user_id;
            newBalance.type_id = leaveType.type_id;
            newBalance.year = currentYear;
            newBalance.total_days = rule.initialDays;
            newBalance.used_days = 0;
            newBalance.available_days = rule.initialDays;
            balances.push(newBalance);
          }
        }
      }
      if (balances.length > 0) {
        await leaveBalanceRepository.save(balances);
        console.log(`Seeded ${balances.length} leave balances successfully.`);
      } else {
        console.log("No new leave balances to seed.");
      }

      console.log("Database seeding completed.");
    } catch (error) {
      console.error("Error during seeding:", error);
      throw error;
    }
  }
}

// Run the seeder
async function run() {
  try {
    console.log("Initializing database connection for seeding...");
    await AppDataSource.initialize();
    console.log("Database connection initialized.");

    await runSeeder(AppDataSource, MainSeeder);
    console.log("Seeding process finished.");

    await AppDataSource.destroy();
    console.log("Database connection closed.");
  } catch (error) {
    console.error("Error running seeder:", error);
    process.exit(1);
  }
}

run();
