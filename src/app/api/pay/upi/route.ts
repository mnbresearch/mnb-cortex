import { NextRequest, NextResponse } from "next/server";
import {
  validateVpa,
  buildUpiUri,
  generateUpiQrSvg,
  buildUpiAppLinks,
} from "@/lib/pay/upi";

export const dynamic = "force-dynamic";

/**
 * Native NPCI Dynamic UPI QR Code & Intent API.
 * Returns dynamic payment metadata, deep links, or standalone SVG image.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const rawVpa = searchParams.get("pa") || searchParams.get("vpa");
  const rawName = searchParams.get("pn") || searchParams.get("name") || "Merchant";
  const rawAmount = searchParams.get("am") || searchParams.get("amount") || "0";
  const note = searchParams.get("tn") || searchParams.get("note") || undefined;
  const invoiceNo = searchParams.get("tr") || searchParams.get("invoice") || undefined;
  const format = searchParams.get("format") || "json";

  if (!rawVpa) {
    return NextResponse.json(
      { ok: false, error: "Missing required parameter: pa (UPI ID / VPA)" },
      { status: 400 }
    );
  }

  const vpaValidation = validateVpa(rawVpa);
  if (!vpaValidation.valid) {
    return NextResponse.json(
      { ok: false, error: vpaValidation.error || "Invalid VPA" },
      { status: 400 }
    );
  }

  const amountNum = parseFloat(rawAmount);
  if (isNaN(amountNum) || amountNum < 0) {
    return NextResponse.json(
      { ok: false, error: "Amount must be a valid non-negative number" },
      { status: 400 }
    );
  }

  const params = {
    payeeVpa: vpaValidation.sanitizedVpa || rawVpa,
    payeeName: rawName,
    amount: amountNum,
    note,
    invoiceNo,
  };

  try {
    const uri = buildUpiUri(params);
    const svg = await generateUpiQrSvg(params);

    if (format === "svg") {
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      });
    }

    const appLinks = buildUpiAppLinks(params);
    return NextResponse.json({
      ok: true,
      uri,
      vpa: params.payeeVpa,
      payeeName: params.payeeName,
      amount: params.amount,
      links: appLinks,
      svg,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to generate UPI QR" },
      { status: 500 }
    );
  }
}
