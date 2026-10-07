/** Public investor signup + login (no employee code, separate from CRM auth). */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { investorApi, InvestorApiError, useInvestorSession } from "./api";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#000000] px-4 py-10 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="font-serif text-3xl tracking-wide">Ocean<span className="text-[#D4AF37]">Luxe</span></div>
          <div className="mt-1 text-xs uppercase tracking-[0.3em] text-neutral-500">Investor Portal</div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InvestorSignup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [pof, setPof] = useState<File | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", password: "", confirm: "" });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await investorApi.signup(
        { firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password, phone: form.phone || undefined, company: form.company || undefined },
        pof ?? undefined,
      );
      setDone(true);
    } catch (err) {
      const msg = err instanceof InvestorApiError ? err.message : "Signup failed. Please try again.";
      toast({ title: "Signup failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <Card className="border-white/10 bg-[#121212]">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-[#D4AF37]" />
            <CardTitle className="font-serif text-xl text-white">Application received</CardTitle>
            <p className="text-sm text-neutral-400">
              Your investor account is <span className="text-[#D4AF37]">pending approval</span>.
              We'll notify you once an admin approves it — then you can build your buy box and start discovering deals.
            </p>
            <Button variant="outline" className="border-white/20 text-white" onClick={() => setLocation("/investor/login")}>Back to login</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="border-white/10 bg-[#121212]">
        <CardHeader>
          <CardTitle className="font-serif text-xl text-white">Become an investor</CardTitle>
          <CardDescription className="text-neutral-400">Get matched with off-market wholesale deals that fit your buy box.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-neutral-300">First name</Label><Input required value={form.firstName} onChange={set("firstName")} className="border-white/10 bg-black text-white" /></div>
              <div><Label className="text-neutral-300">Last name</Label><Input required value={form.lastName} onChange={set("lastName")} className="border-white/10 bg-black text-white" /></div>
            </div>
            <div><Label className="text-neutral-300">Email</Label><Input required type="email" value={form.email} onChange={set("email")} className="border-white/10 bg-black text-white" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-neutral-300">Phone</Label><Input value={form.phone} onChange={set("phone")} className="border-white/10 bg-black text-white" /></div>
              <div><Label className="text-neutral-300">Company (optional)</Label><Input value={form.company} onChange={set("company")} className="border-white/10 bg-black text-white" /></div>
            </div>
            <div><Label className="text-neutral-300">Password (10+ characters)</Label><Input required type="password" minLength={10} value={form.password} onChange={set("password")} className="border-white/10 bg-black text-white" /></div>
            <div><Label className="text-neutral-300">Confirm password</Label><Input required type="password" value={form.confirm} onChange={set("confirm")} className="border-white/10 bg-black text-white" /></div>
            <div>
              <Label className="text-neutral-300">Proof of funds (optional — PDF or image)</Label>
              <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-sm text-neutral-400 hover:border-[#D4AF37]/60 hover:text-white">
                <Upload className="h-4 w-4" />
                {pof ? pof.name : "Upload POF document"}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setPof(e.target.files?.[0] ?? null)} />
              </label>
              <p className="mt-1 text-xs text-neutral-500">Verified POF unlocks off-market contract inventory.</p>
            </div>
            <Button type="submit" disabled={busy} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply for access
            </Button>
            <p className="text-center text-sm text-neutral-500">
              Already approved? <Link href="/investor/login"><a className="text-[#D4AF37] hover:underline">Sign in</a></Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function InvestorLogin() {
  const [, setLocation] = useLocation();
  const { user, loading } = useInvestorSession();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!loading && user) {
    setLocation("/investor/discover");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await investorApi.login(email, password);
      setLocation("/investor/discover");
    } catch (err) {
      const msg = err instanceof InvestorApiError ? err.message : "Login failed.";
      toast({ title: "Login failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <Card className="border-white/10 bg-[#121212]">
        <CardHeader>
          <CardTitle className="font-serif text-xl text-white">Investor sign in</CardTitle>
          <CardDescription className="text-neutral-400">Separate from the agent CRM — investors only.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div><Label className="text-neutral-300">Email</Label><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-white/10 bg-black text-white" /></div>
            <div><Label className="text-neutral-300">Password</Label><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border-white/10 bg-black text-white" /></div>
            <Button type="submit" disabled={busy} className="bg-[#D4AF37] font-semibold text-black hover:bg-[#c19b2e]">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign in
            </Button>
            <p className="text-center text-sm text-neutral-500">
              New here? <Link href="/investor/signup"><a className="text-[#D4AF37] hover:underline">Apply for access</a></Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}
