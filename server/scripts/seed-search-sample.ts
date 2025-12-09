import { storage } from "../storage.js";

async function ensureSample() {
  const leads = await storage.getLeads(1, 0);
  if (!leads?.length) {
    await storage.createLead({
      address: "123 Main St",
      city: "Springfield",
      state: "CA",
      zipCode: "90001",
      ownerName: "John Doe",
      ownerPhone: "555-1234",
      ownerEmail: "john@example.com",
      status: "new",
    });
  }

  const properties = await storage.getProperties(1, 0);
  if (!properties?.length) {
    await storage.createProperty({
      address: "456 Oak Ave",
      city: "Springfield",
      state: "CA",
      zipCode: "90002",
      status: "active",
      apn: "APN-001",
    } as any);
  }

  const contacts = await storage.getContacts(1, 0);
  if (!contacts?.length) {
    await storage.createContact({
      name: "Jane Smith",
      email: "jane@example.com",
      phone: "555-9876",
      type: "seller",
      company: "Acme Co",
    });
  }
}

ensureSample().then(() => {
  console.log("Seeded sample search data");
  process.exit(0);
}).catch((e) => {
  console.error("Seed failed", e);
  process.exit(1);
});

