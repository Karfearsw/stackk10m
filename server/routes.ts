import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { 
  insertLeadSchema, 
  insertPropertySchema, 
  insertContactSchema, 
  insertContractSchema,
  insertContractTemplateSchema,
  insertContractDocumentSchema,
  insertDocumentVersionSchema,
  insertLoiSchema,
  insertUserSchema,
  insertTwoFactorAuthSchema,
  insertBackupCodeSchema,
  insertTeamSchema,
  insertTeamMemberSchema,
  insertTeamActivityLogSchema,
  insertNotificationPreferenceSchema,
  insertUserGoalSchema,
  insertOfferSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // AUTH ENDPOINTS
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive" });
      }

      req.session.userId = user.id;
      req.session.email = user.email;

      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, password, role = "employee", isSuperAdmin = false, isActive = true } = req.body;
      
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use" });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const newUser = await storage.createUser({
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        isSuperAdmin,
        isActive,
      });

      req.session.userId = newUser.id;
      req.session.email = newUser.email;

      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json({ user: userWithoutPassword });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "User not found" });
      }

      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // LEADS ENDPOINTS
  app.get("/api/leads", async (req, res) => {
    try {
      const allLeads = await storage.getLeads();
      res.json(allLeads);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json(lead);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/leads", async (req, res) => {
    try {
      const validated = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(validated);
      res.status(201).json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/leads/:id", async (req, res) => {
    try {
      const partial = insertLeadSchema.partial().parse(req.body);
      const lead = await storage.updateLead(parseInt(req.params.id), partial);
      res.json(lead);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/leads/:id", async (req, res) => {
    try {
      await storage.deleteLead(parseInt(req.params.id));
      res.json({ message: "Lead deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PROPERTIES ENDPOINTS
  app.get("/api/properties", async (req, res) => {
    try {
      const allProperties = await storage.getProperties();
      res.json(allProperties);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      if (!property) return res.status(404).json({ message: "Property not found" });
      res.json(property);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/properties", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validated);
      res.status(201).json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/properties/:id", async (req, res) => {
    try {
      const partial = insertPropertySchema.partial().parse(req.body);
      const property = await storage.updateProperty(parseInt(req.params.id), partial);
      res.json(property);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/properties/:id", async (req, res) => {
    try {
      await storage.deleteProperty(parseInt(req.params.id));
      res.json({ message: "Property deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTRACTS ENDPOINTS
  app.get("/api/contracts", async (req, res) => {
    try {
      const allContracts = await storage.getContracts();
      res.json(allContracts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      res.json(contract);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contracts", async (req, res) => {
    try {
      const validated = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(validated);
      res.status(201).json(contract);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contracts/:id", async (req, res) => {
    try {
      const partial = insertContractSchema.partial().parse(req.body);
      const contract = await storage.updateContract(parseInt(req.params.id), partial);
      res.json(contract);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contracts/:id", async (req, res) => {
    try {
      await storage.deleteContract(parseInt(req.params.id));
      res.json({ message: "Contract deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTACTS ENDPOINTS
  app.get("/api/contacts", async (req, res) => {
    try {
      const allContacts = await storage.getContacts();
      res.json(allContacts);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validated);
      res.status(201).json(contact);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // CONTRACT TEMPLATES ENDPOINTS
  app.get("/api/contract-templates", async (req, res) => {
    try {
      const templates = await storage.getContractTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-templates/:id", async (req, res) => {
    try {
      const template = await storage.getContractTemplateById(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-templates", async (req, res) => {
    try {
      const validated = insertContractTemplateSchema.parse(req.body);
      const template = await storage.createContractTemplate(validated);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contract-templates/:id", async (req, res) => {
    try {
      const partial = insertContractTemplateSchema.partial().parse(req.body);
      const template = await storage.updateContractTemplate(parseInt(req.params.id), partial);
      res.json(template);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contract-templates/:id", async (req, res) => {
    try {
      await storage.deleteContractTemplate(parseInt(req.params.id));
      res.json({ message: "Template deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CONTRACT DOCUMENTS ENDPOINTS
  app.get("/api/contract-documents", async (req, res) => {
    try {
      const documents = await storage.getContractDocuments();
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/contract-documents/:id", async (req, res) => {
    try {
      const document = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!document) return res.status(404).json({ message: "Document not found" });
      res.json(document);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/contract-documents", async (req, res) => {
    try {
      const validated = insertContractDocumentSchema.parse(req.body);
      const document = await storage.createContractDocument(validated);
      res.status(201).json(document);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/contract-documents/:id", async (req, res) => {
    try {
      const partial = insertContractDocumentSchema.partial().parse(req.body);
      const document = await storage.updateContractDocument(parseInt(req.params.id), partial);
      res.json(document);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/contract-documents/:id", async (req, res) => {
    try {
      await storage.deleteContractDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DOCUMENT VERSIONS ENDPOINTS
  app.get("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const versions = await storage.getDocumentVersions(parseInt(req.params.documentId));
      res.json(versions);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const validated = insertDocumentVersionSchema.parse({
        ...req.body,
        documentId: parseInt(req.params.documentId)
      });
      const version = await storage.createDocumentVersion(validated);
      res.status(201).json(version);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // LOIS ENDPOINTS
  app.get("/api/lois", async (req, res) => {
    try {
      const allLois = await storage.getLois();
      res.json(allLois);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/lois/:id", async (req, res) => {
    try {
      const loi = await storage.getLoiById(parseInt(req.params.id));
      if (!loi) return res.status(404).json({ message: "LOI not found" });
      res.json(loi);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/lois", async (req, res) => {
    try {
      const validated = insertLoiSchema.parse(req.body);
      const loi = await storage.createLoi(validated);
      res.status(201).json(loi);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/lois/:id", async (req, res) => {
    try {
      const partial = insertLoiSchema.partial().parse(req.body);
      const loi = await storage.updateLoi(parseInt(req.params.id), partial);
      res.json(loi);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/lois/:id", async (req, res) => {
    try {
      await storage.deleteLoi(parseInt(req.params.id));
      res.json({ message: "LOI deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // USERS ENDPOINTS
  app.get("/api/users", async (req, res) => {
    try {
      const users = await storage.getUsers();
      res.json(users);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUserById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validated);
      res.status(201).json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Change password
  app.patch("/api/users/:id/password", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const userId = parseInt(req.params.id);
    if (req.session.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ message: "User not found" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(userId, { passwordHash: newPasswordHash });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      const partial = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(parseInt(req.params.id), partial);
      res.json(user);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // TWO FACTOR AUTH ENDPOINTS
  app.get("/api/users/:userId/2fa", async (req, res) => {
    try {
      const auth = await storage.getTwoFactorAuthByUserId(parseInt(req.params.userId));
      res.json(auth || { isEnabled: false });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/2fa", async (req, res) => {
    try {
      const validated = insertTwoFactorAuthSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const auth = await storage.createTwoFactorAuth(validated);
      res.status(201).json(auth);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/users/:userId/2fa", async (req, res) => {
    try {
      const partial = insertTwoFactorAuthSchema.partial().parse(req.body);
      const auth = await storage.updateTwoFactorAuth(parseInt(req.params.userId), partial);
      res.json(auth);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/users/:userId/2fa", async (req, res) => {
    try {
      await storage.deleteTwoFactorAuth(parseInt(req.params.userId));
      res.json({ message: "2FA disabled" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // BACKUP CODES ENDPOINTS
  app.get("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const codes = await storage.getBackupCodesByUserId(parseInt(req.params.userId));
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const validated = insertBackupCodeSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const code = await storage.createBackupCode(validated);
      res.status(201).json(code);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // TEAMS ENDPOINTS
  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.getTeamById(parseInt(req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      res.json(team);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const validated = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(validated);
      res.status(201).json(team);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const partial = insertTeamSchema.partial().parse(req.body);
      const team = await storage.updateTeam(parseInt(req.params.id), partial);
      res.json(team);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      await storage.deleteTeam(parseInt(req.params.id));
      res.json({ message: "Team deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TEAM MEMBERS ENDPOINTS
  app.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(parseInt(req.params.teamId));
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const validated = insertTeamMemberSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const member = await storage.createTeamMember(validated);
      res.status(201).json(member);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/team-members/:id", async (req, res) => {
    try {
      const partial = insertTeamMemberSchema.partial().parse(req.body);
      const member = await storage.updateTeamMember(parseInt(req.params.id), partial);
      res.json(member);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/team-members/:id", async (req, res) => {
    try {
      await storage.deleteTeamMember(parseInt(req.params.id));
      res.json({ message: "Team member removed" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TEAM ACTIVITY LOGS ENDPOINTS
  app.get("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const logs = await storage.getTeamActivityLogs(parseInt(req.params.teamId), limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const validated = insertTeamActivityLogSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const log = await storage.createTeamActivityLog(validated);
      res.status(201).json(log);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // NOTIFICATION PREFERENCES ENDPOINTS
  app.get("/api/users/:userId/notifications", async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferencesByUserId(parseInt(req.params.userId));
      res.json(prefs || {});
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/notifications", async (req, res) => {
    try {
      const validated = insertNotificationPreferenceSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const prefs = await storage.createNotificationPreferences(validated);
      res.status(201).json(prefs);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/users/:userId/notifications", async (req, res) => {
    try {
      const partial = insertNotificationPreferenceSchema.partial().parse(req.body);
      const prefs = await storage.updateNotificationPreferences(parseInt(req.params.userId), partial);
      res.json(prefs);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // USER GOALS ENDPOINTS
  app.get("/api/users/:userId/goals", async (req, res) => {
    try {
      const goals = await storage.getUserGoals(parseInt(req.params.userId));
      res.json(goals);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.getUserGoalById(parseInt(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      res.json(goal);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/users/:userId/goals", async (req, res) => {
    try {
      const validated = insertUserGoalSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const goal = await storage.createUserGoal(validated);
      res.status(201).json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/goals/:id", async (req, res) => {
    try {
      const partial = insertUserGoalSchema.partial().parse(req.body);
      const goal = await storage.updateUserGoal(parseInt(req.params.id), partial);
      res.json(goal);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/goals/:id", async (req, res) => {
    try {
      await storage.deleteUserGoal(parseInt(req.params.id));
      res.json({ message: "Goal deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // OFFERS ENDPOINTS
  app.get("/api/offers", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId as string) : undefined;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
      
      if (userId) {
        const offers = await storage.getOffersByUserId(userId);
        return res.json(offers);
      }
      if (propertyId) {
        const offers = await storage.getOffersByPropertyId(propertyId);
        return res.json(offers);
      }
      const offers = await storage.getOffers();
      res.json(offers);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.getOfferById(parseInt(req.params.id));
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      res.json(offer);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      res.status(201).json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/offers/:id", async (req, res) => {
    try {
      const partial = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(parseInt(req.params.id), partial);
      res.json(offer);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/offers/:id", async (req, res) => {
    try {
      await storage.deleteOffer(parseInt(req.params.id));
      res.json({ message: "Offer deleted" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
