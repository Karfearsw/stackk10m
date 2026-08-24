import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Video } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";

type CreateMeetingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: number | null;
  defaultName?: string;
  onCreated?: (room: { roomId: string; name: string }) => void;
};

export function CreateMeetingDialog({
  open,
  onOpenChange,
  propertyId,
  defaultName,
  onCreated,
}: CreateMeetingDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(defaultName || "");
  const [description, setDescription] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("10");

  const createRoom = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/video/rooms", {
        name: name.trim(),
        maxParticipants: parseInt(maxParticipants, 10) || 10,
        propertyId: propertyId || undefined,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast.success(`Meeting "${data.name}" created`);
      queryClient.invalidateQueries({ queryKey: ["/api/video/rooms"] });
      setName("");
      setDescription("");
      setMaxParticipants("10");
      onOpenChange(false);
      onCreated?.(data);
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to create meeting");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createRoom.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Create Video Meeting
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-name">Meeting Name *</Label>
            <Input
              id="meeting-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Property walkthrough, Buyer call..."
              data-testid="input-meeting-name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-desc">Description (optional)</Label>
            <Textarea
              id="meeting-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, notes..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-max">Max Participants</Label>
            <Input
              id="meeting-max"
              type="number"
              min="2"
              max="50"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createRoom.isPending}
              className="bg-primary text-white hover:bg-primary/90"
              data-testid="button-create-meeting"
            >
              {createRoom.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Meeting
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
