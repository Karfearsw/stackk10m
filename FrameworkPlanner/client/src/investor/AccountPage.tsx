import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, Upload, ShieldCheck, ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { investorApi, InvestorApiError, useInvestorSession } from "./api";
import { InvestorPage, RequireInvestor } from "./InvestorLayout";

export function AccountPage() {
  return (
    <RequireInvestor>
      <AccountBody />
    </RequireInvestor>
  );
}

function AccountBody() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, pofVerified, pofProvided, loading, logout, refresh } = useInvestorSession();
  const [uploading, setUploading] = useState(false);

  useEffect(() => { refresh(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      await investorApi.uploadPof(file);
      toast({ title: "Proof of funds uploaded", description: "An admin will verify it — off-market deals unlock after verification." });
      refresh();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof InvestorApiError ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  if (loading || !user) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#D4AF37]" /></div>;
  }

  return (
    <InvestorPage title="Account" subtitle="Profile, verification, and preferences.">
      <div className="flex flex-col gap-4">
        <Card className="border-white/10 bg-[#121212]">
          <CardHeader><CardTitle className="font-serif text-lg text-white">Profile</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span className="text-neutral-500">Name</span><span className="text-white">{user.firstName} {user.lastName}</span></div>
            <div className="flex justify-between"><span className="text-neutral-500">Email</span><span className="text-white">{user.email}</span></div>
            {user.phone && <div className="flex justify-between"><span className="text-neutral-500">Phone</span><span className="text-white">{user.phone}</span></div>}
            {user.companyName && <div className="flex justify-between"><span className="text-neutral-500">Company</span><span className="text-white">{user.companyName}</span></div>}
            <div className="flex justify-between"><span className="text-neutral-500">Status</span>
              <Badge className="bg-emerald-500/15 text-emerald-300">{user.investorStatus}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#121212]">
          <CardHeader><CardTitle className="font-serif text-lg text-white">Proof of funds</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              {pofVerified ? (
                <><ShieldCheck className="h-6 w-6 text-emerald-400" /><span className="text-sm text-white">Verified — off-market inventory is unlocked.</span></>
              ) : pofProvided ? (
                <><ShieldAlert className="h-6 w-6 text-amber-400" /><span className="text-sm text-neutral-300">Uploaded — pending admin verification.</span></>
              ) : (
                <><ShieldAlert className="h-6 w-6 text-neutral-500" /><span className="text-sm text-neutral-400">Not provided — upload to unlock off-market deals.</span></>
              )}
            </div>
            {!pofVerified && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-4 py-3 text-sm text-neutral-300 hover:border-[#D4AF37]/60 hover:text-white">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Upload proof of funds (PDF or image, max 10 MB)"}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              </label>
            )}
            <p className="text-xs text-neutral-500">Documents are stored securely and are only visible to admins — never to other investors.</p>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-[#121212]">
          <CardHeader><CardTitle className="font-serif text-lg text-white">Preferences</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link href="/investor/buy-box">
              <Button variant="outline" className="border-white/20 text-white">Edit buy box & notifications</Button>
            </Link>
            <Button variant="ghost" className="w-fit text-neutral-400 hover:text-white"
              onClick={async () => { await logout(); setLocation("/investor/login"); }}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </InvestorPage>
  );
}
