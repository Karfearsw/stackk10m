import { storage } from "../storage.js";
import { sendContractReminderEmail } from "../services/contracts/email.js";

const REMINDER_HOURS = [24, 72, 168];
const REMINDER_LIMIT = 50;

function hoursSince(date: Date | string | null): number {
  if (!date) return Infinity;
  const diff = Date.now() - new Date(date).getTime();
  return diff / (1000 * 60 * 60);
}

export async function runContractReminders() {
  console.log("[ContractReminders] Running reminder check...");
  try {
    const contracts = await storage.getContracts(REMINDER_LIMIT);
    let sent = 0;

    for (const contract of contracts) {
      if (contract.status !== "sent" && contract.status !== "viewed" && contract.status !== "partially_signed") {
        continue;
      }

      const signers = await storage.getContractSignersByContract(contract.id);
      for (const signer of signers) {
        if (signer.status === "signed" || signer.status === "declined") continue;
        if (!signer.email) continue;
        if (signer.expiresAt && new Date(signer.expiresAt).getTime() < Date.now()) continue;

        const sinceSent = hoursSince(signer.sentAt);
        const sinceLastReminder = hoursSince(signer.lastReminderAt || null);
        const reminderCount = signer.reminderCount || 0;

        const nextReminderHours = REMINDER_HOURS[Math.min(reminderCount, REMINDER_HOURS.length - 1)];

        if (sinceSent >= nextReminderHours && (sinceLastReminder >= nextReminderHours || reminderCount === 0)) {
          try {
            const signingUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/sign/signers/${signer.tokenHash}`;
            await sendContractReminderEmail({
              to: signer.email,
              signerName: signer.name,
              contractTitle: contract.notes || `Contract #${contract.id}`,
              signingUrl,
              expiresAt: signer.expiresAt ? new Date(signer.expiresAt).toISOString() : undefined,
            });

            await storage.updateContractSigner(signer.id, {
              reminderCount: reminderCount + 1,
              lastReminderAt: new Date(),
            } as any);

            await storage.createContractEvent({
              contractId: contract.id,
              actorType: "system",
              eventType: "reminded",
              payloadJson: JSON.stringify({ signerId: signer.id, reminderCount: reminderCount + 1 }),
            });

            sent++;
          } catch (e) {
            console.error(`[ContractReminders] Failed to send reminder for signer ${signer.id}:`, e);
          }
        }
      }
    }

    console.log(`[ContractReminders] Sent ${sent} reminders`);
  } catch (error) {
    console.error("[ContractReminders] Error:", error);
  }
}

export function startContractReminderWorker(intervalMs = 3600_000) {
  runContractReminders();
  setInterval(runContractReminders, intervalMs);
  console.log(`[ContractReminders] Worker started (${intervalMs}ms interval)`);
}
