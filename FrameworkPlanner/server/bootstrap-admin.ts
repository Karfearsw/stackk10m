import bcrypt from "bcryptjs";
import { storage } from "./storage.js";

async function bootstrapAdmin() {
  try {
    console.log("🔐 Bootstrapping admin account...");

    const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.ADMIN_USERNAME;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME || "Admin";
    const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME || "User";
    const companyName = process.env.BOOTSTRAP_ADMIN_COMPANY || "FlipStackk";

    if (!adminEmail) {
      throw new Error("Missing admin email. Set BOOTSTRAP_ADMIN_EMAIL or ADMIN_USERNAME.");
    }
    if (!password) {
      throw new Error("Missing admin password. Set BOOTSTRAP_ADMIN_PASSWORD or ADMIN_PASSWORD.");
    }

    const existingAdmin = await storage.getUserByEmail(adminEmail);

    if (existingAdmin) {
      console.log("✅ Admin account already exists");
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.firstName} ${existingAdmin.lastName}`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const adminUser = await storage.createUser({
      email: adminEmail,
      passwordHash,
      firstName,
      lastName,
      companyName,
      role: "admin",
      isSuperAdmin: true,
      isActive: true,
    });

    console.log("✅ Admin account created successfully!");
    console.log(`   ID: ${adminUser.id}`);
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.firstName} ${adminUser.lastName}`);

    const team = await storage.createTeam({
      name: "FlipStackk Team",
      description: "Primary team for FlipStackk operations",
      ownerId: adminUser.id,
      isActive: true,
    });

    console.log("✅ Admin team created!");
    console.log(`   Team ID: ${team.id}`);
    console.log(`   Team Name: ${team.name}`);

    await storage.createTeamMember({
      teamId: team.id,
      userId: adminUser.id,
      role: "owner",
      status: "active",
      joinedAt: new Date(),
    });

    console.log("✅ Admin added to team as owner!");
    console.log("\n🎉 Bootstrap complete! Admin can now login with:");
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: (as provided)`);
    
  } catch (error: any) {
    console.error("❌ Bootstrap failed:", error.message);
    throw error;
  }
}

bootstrapAdmin()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
