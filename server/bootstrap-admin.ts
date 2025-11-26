import bcrypt from "bcryptjs";
import { storage } from "./storage";

async function bootstrapAdmin() {
  try {
    console.log("🔐 Bootstrapping admin account...");

    const adminEmail = "bennyjelleh@icloud.com";
    const existingAdmin = await storage.getUserByEmail(adminEmail);

    if (existingAdmin) {
      console.log("✅ Admin account already exists");
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Name: ${existingAdmin.firstName} ${existingAdmin.lastName}`);
      return;
    }

    const password = "FlipStackk2024!";
    const passwordHash = await bcrypt.hash(password, 12);

    const adminUser = await storage.createUser({
      email: adminEmail,
      passwordHash,
      firstName: "Benji Stackk",
      lastName: "Jelleh",
      companyName: "FlipStackk",
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
