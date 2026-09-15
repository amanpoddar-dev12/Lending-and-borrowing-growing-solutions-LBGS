import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProfileCompletion, saveProfileCompletion } from "@/lib/profile-completion.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";

export const Route = createFileRoute("/_authenticated/complete-profile")({
  head: () => ({
    meta: [
      { title: "Complete your profile — LBGS" },
      { name: "description", content: "Finish setting up your LBGS account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: qk.profileCompletion,
      queryFn: () => getProfileCompletion(),
    }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const { data } = useSuspenseQuery({
    queryKey: qk.profileCompletion,
    queryFn: () => getProfileCompletion(),
  });
  const save = useServerFn(saveProfileCompletion);
  const navigate = useNavigate();
  const isClient = data.role === "client";

  const [name, setName] = useState(data.client?.contact_person ?? "");
  const [businessName, setBusinessName] = useState(data.client?.business_name ?? "");
  const [gst, setGst] = useState(data.client?.gst_number ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data.complete) navigate({ to: "/dashboard", replace: true });
  }, [data.complete, navigate]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Please enter your full name");
    if (isClient) {
      if (businessName.trim().length < 2) return toast.error("Business name is required");
      if (gst.trim().length < 5) return toast.error("GST number is required");
    }
    setBusy(true);
    try {
      await save({
        data: {
          name: name.trim(),
          business_name: isClient ? businessName.trim() : undefined,
          gst_number: isClient ? gst.trim() : undefined,
        },
      });
      toast.success("Profile saved");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-[70vh] place-items-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-display text-xl">Complete your profile</CardTitle>
          <CardDescription>
            We need a few details before you can access the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {isClient && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="business">Business / company name</Label>
                  <Input
                    id="business"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gst">GST number</Label>
                  <Input id="gst" required value={gst} onChange={(e) => setGst(e.target.value)} />
                </div>
              </>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
