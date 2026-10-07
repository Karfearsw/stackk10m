import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { CodecPicker } from "./CodecPicker";

function mask(p: string) {
  return p ? `${p.slice(0, 4)}•••${p.slice(-3)}` : "";
}

/**
 * Per-user phone settings summary: the ticket-8 agent phone + caller ID the
 * CallBar's outbound calls present, plus the WebRTC codec picker.
 */
export function PhoneSettingsCard() {
  const { data } = useQuery({
    queryKey: ["/api/v1/telecom/agent-phone"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/v1/telecom/agent-phone");
      return res.json();
    },
    retry: 1,
  });

  return (
    <Card data-testid="phone-settings-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Phone Settings</CardTitle>
        <CardDescription>Your per-user dialing identity (Settings → agent phone)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Your phone: </span>
          <span className="font-medium">{data?.phoneE164 ? mask(String(data.phoneE164)) : "Not set"}</span>
          <span className="text-muted-foreground"> · Caller ID shown: </span>
          <span className="font-medium">{data?.callerIdE164 ? mask(String(data.callerIdE164)) : "Default number"}</span>
        </div>
        <CodecPicker />
      </CardContent>
    </Card>
  );
}
