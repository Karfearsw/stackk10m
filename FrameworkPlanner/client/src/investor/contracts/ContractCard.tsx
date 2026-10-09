/**
 * Contract card (Phase 16): document name, property, related deal, parties,
 * version, status, signer progress, key times, and next action.
 */
import { Link } from "wouter";
import { FileText } from "lucide-react";
import { LuxeStatusBadge, LuxeDocumentStatus, type LuxeDocState } from "@/components/luxe";
import { formatDate, formatDateTime, money, type ContractCardDto, type ContractStage } from "../lockedup/api";

export const DOC_STATE_MAP: Record<ContractStage, LuxeDocState> = {
  draft: "draft",
  internal_review: "internal_review",
  attorney_review: "attorney_review",
  ready: "ready",
  sent: "sent",
  delivered: "sent",
  opened: "opened",
  partially_signed: "partially_signed",
  executed: "executed",
  declined: "declined",
  voided: "voided",
  expired: "expired",
  superseded: "voided",
};

export function signerTone(status: string): "verified" | "oxblood" | "info" | "gold" | "neutral" {
  const s = status.toLowerCase();
  if (s === "signed") return "verified";
  if (s === "declined" || s === "expired") return "oxblood";
  if (s === "viewed") return "info";
  if (s === "sent") return "gold";
  return "neutral";
}

export function ContractCard({ card }: { card: ContractCardDto }) {
  return (
    <Link href={`/investor/contracts/${card.id}`}>
      <a className="block rounded-lg border border-white/10 bg-[#121212] p-4 transition-colors hover:border-[#D4AF37]/40">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
              <FileText className="h-4 w-4 text-[#D4AF37]" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate font-serif font-medium text-white">{card.documentName}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {card.property ? `${card.property.address}, ${card.property.city}, ${card.property.state}` : "No property linked"}
                {card.deal ? ` · ${card.deal.stageLabel}` : ""}
              </p>
            </div>
          </div>
          <LuxeDocumentStatus
            state={DOC_STATE_MAP[card.stage]}
            signersCompleted={card.signersDone}
            signersTotal={card.signersTotal}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid-cols-4">
          <div>
            <p className="text-neutral-500">Parties</p>
            <p className="mt-0.5 truncate text-neutral-200">{card.parties.seller ?? "—"} → {card.parties.buyer ?? "—"}</p>
          </div>
          <div>
            <p className="text-neutral-500">Version</p>
            <p className="mt-0.5 text-neutral-200">v{card.version}{card.contractType ? ` · ${card.contractType}` : ""}</p>
          </div>
          <div>
            <p className="text-neutral-500">Sent / opened</p>
            <p className="mt-0.5 text-neutral-200">{formatDateTime(card.sentAt)} / {formatDateTime(card.lastOpenedAt)}</p>
          </div>
          <div>
            <p className="text-neutral-500">Expiration</p>
            <p className="mt-0.5 text-neutral-200">{formatDate(card.expiration)}</p>
          </div>
        </div>

        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="min-w-0 truncate text-xs text-neutral-400">Next: {card.nextAction}</p>
        </div>
      </a>
    </Link>
  );
}

export function ContractStageBadge({ stage }: { stage: ContractStage }) {
  return <LuxeDocumentStatus state={DOC_STATE_MAP[stage]} />;
}

export function ContractMoney({ value }: { value: number | string | null | undefined }) {
  return <span>{money(value)}</span>;
}

export function ContractMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.12em] text-neutral-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export function ContractReminderBadge({ status }: { status: string }) {
  const tone = status === "sent" ? "verified" : status === "cancelled" ? "neutral" : "gold";
  return <LuxeStatusBadge tone={tone}>{status}</LuxeStatusBadge>;
}
