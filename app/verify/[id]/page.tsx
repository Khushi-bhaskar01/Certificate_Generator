"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Certificate = { id: string; name: string; course: string; date: string; template: string; createdAt: string };

export default function VerifyCertificate({ params }: { params: { id: string } }) {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (supabase) {
          const { data, error } = await supabase.rpc("verify_certificate", { lookup_id: params.id });
          if (error) throw error;
          const item = data?.[0];
          setCertificate(item ? { id: item.certificate_id, name: item.recipient_name, course: item.achievement, date: item.issue_date, template: "", createdAt: item.created_at } : null);
          return;
        } else {
          setCertificate(null);
        }
      } finally {
        setChecked(true);
      }
    };
    void load();
  }, [params.id]);

  return <main className="verify-page"><p className="eyebrow">CERTIFICATE VERIFICATION</p><h1>{certificate ? <>Certificate <em>verified.</em></> : <>Certificate <em>not found.</em></>}</h1>{certificate ? <div className="verify-result valid"><b>✓ This certificate is authentic</b><p><strong>{certificate.name}</strong> completed <strong>{certificate.course}</strong> on {certificate.date}.</p><p>Generated on <strong>{new Date(certificate.createdAt).toLocaleString()}</strong>.</p><code>{certificate.id}</code></div> : checked && <div className="verify-result invalid"><b>This certificate could not be verified</b><p>The certificate ID is invalid or is not available in this verification database.</p></div>}<div className="verify-note">Verification ID: {params.id.toUpperCase()}</div></main>;
}
