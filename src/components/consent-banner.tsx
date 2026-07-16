"use client";
import { useEffect, useState } from "react";
import { Shield, Bell, X } from "lucide-react";

export function ConsentBanner() {
  const [show, setShow] = useState(false);
  const [notif, setNotif] = useState<string>("default");
  useEffect(() => {
    if (!localStorage.getItem("mnb-consent")) setShow(true);
    if (typeof Notification !== "undefined") setNotif(Notification.permission);
  }, []);
  function accept() { localStorage.setItem("mnb-consent", new Date().toISOString()); setShow(false); }
  async function enableNotifs() { try { if (typeof Notification !== "undefined") { const p = await Notification.requestPermission(); setNotif(p); } } catch {} }
  if (!show) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-[70] p-3 no-print">
      <div className="max-w-3xl mx-auto rounded-xl border bg-card shadow-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Shield className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground flex-1">We use essential cookies for sign-in and to remember your preferences. By continuing you agree to our use of cookies and to be contacted about your inquiries. You can enable notifications for AI alerts.</p>
        <div className="flex items-center gap-2 shrink-0">
          {notif !== "granted" && <button onClick={enableNotifs} className="inline-flex items-center gap-1.5 rounded-lg border h-9 px-3 text-sm hover:bg-accent"><Bell className="h-4 w-4" /> Notifications</button>}
          <button onClick={accept} className="rounded-lg bg-primary text-primary-foreground h-9 px-4 text-sm font-medium">Accept & continue</button>
        </div>
      </div>
    </div>
  );
}
