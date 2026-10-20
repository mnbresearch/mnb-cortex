import QRCode from "qrcode";

/**
 * Native NPCI Unified Payments Interface (UPI) Specification Engine.
 *
 * Enables 100% free, zero-fee payment collections for SME invoices, receivables,
 * and settlements without incurring payment gateway MDR commissions (saving 1.5-2% + 18% GST).
 * Under NPCI guidelines, peer-to-merchant UPI transfers incur 0% MDR for bank accounts.
 */

export interface UpiPaymentParams {
  /** Payee Virtual Payment Address (VPA / UPI ID), e.g. "billing@icici" or "acmetraders@okaxis" */
  payeeVpa: string;
  /** Legal registered or display business name of the payee */
  payeeName: string;
  /** Amount in Indian Rupees (INR) */
  amount: number;
  /** Transaction note shown on customer's UPI payment confirmation screen (max 80 chars) */
  note?: string;
  /** Unique Transaction Reference / Invoice Number (max 35 alphanumeric characters) */
  invoiceNo?: string;
  /** Optional Merchant Category Code (4 digits, e.g. "5411") */
  merchantCode?: string;
}

export interface UpiValidationResult {
  valid: boolean;
  sanitizedVpa?: string;
  error?: string;
}

/** Standard NPCI VPA format validation regex */
const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;

/**
 * Validates a UPI ID / VPA.
 */
export function validateVpa(rawVpa: string): UpiValidationResult {
  if (!rawVpa || typeof rawVpa !== "string") {
    return { valid: false, error: "UPI ID is required" };
  }
  const sanitized = rawVpa.trim().toLowerCase();
  if (!sanitized.includes("@")) {
    return { valid: false, error: "UPI ID must contain '@' handle (e.g. business@okhdfcbank)" };
  }
  if (!VPA_REGEX.test(sanitized)) {
    return { valid: false, error: "Invalid UPI ID characters or structure" };
  }
  return { valid: true, sanitizedVpa: sanitized };
}

/**
 * Builds an RFC-compliant NPCI UPI Deep Link URI.
 * On mobile devices, clicking this URI opens the native UPI chooser (Google Pay, PhonePe, Paytm, BHIM, CRED).
 */
export function buildUpiUri(params: UpiPaymentParams): string {
  const vpaCheck = validateVpa(params.payeeVpa);
  const vpa = vpaCheck.valid && vpaCheck.sanitizedVpa ? vpaCheck.sanitizedVpa : params.payeeVpa.trim();
  const name = (params.payeeName || "").trim().slice(0, 70);
  const amount = Number.isFinite(params.amount) ? Math.max(0, params.amount) : 0;
  const amountStr = amount.toFixed(2);

  const query = new URLSearchParams();
  query.set("pa", vpa);
  query.set("pn", name);
  query.set("am", amountStr);
  query.set("cu", "INR");

  if (params.note) {
    // NPCI specification limits transaction note to 80 characters
    query.set("tn", params.note.trim().slice(0, 80));
  } else if (params.invoiceNo) {
    query.set("tn", `Invoice ${params.invoiceNo.trim()}`.slice(0, 80));
  }

  if (params.invoiceNo) {
    // Alphanumeric, underscores, hyphens only; max 35 characters
    const cleanRef = params.invoiceNo.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 35);
    if (cleanRef) {
      query.set("tr", cleanRef);
    }
  }

  if (params.merchantCode) {
    const cleanMc = params.merchantCode.replace(/\D/g, "").slice(0, 4);
    if (cleanMc.length === 4) {
      query.set("mc", cleanMc);
    }
  }

  return `upi://pay?${query.toString()}`;
}

/**
 * Generates an SVG vector string representation of the dynamic UPI QR code.
 * Directly embeddable in server-rendered React components, PDF exports, and print invoices.
 */
export async function generateUpiQrSvg(
  params: UpiPaymentParams,
  options?: { margin?: number; color?: { dark?: string; light?: string } }
): Promise<string> {
  const uri = buildUpiUri(params);
  return QRCode.toString(uri, {
    type: "svg",
    margin: options?.margin ?? 1,
    color: {
      dark: options?.color?.dark || "#0f172a", // slate-900
      light: options?.color?.light || "#ffffff",
    },
  });
}

/**
 * Generates a base64 Data URL (PNG) of the dynamic UPI QR code for img tags.
 */
export async function generateUpiQrDataUrl(
  params: UpiPaymentParams,
  options?: { width?: number; margin?: number }
): Promise<string> {
  const uri = buildUpiUri(params);
  return QRCode.toDataURL(uri, {
    margin: options?.margin ?? 1,
    width: options?.width ?? 280,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });
}

/**
 * Produces deep links targeting popular UPI applications directly.
 */
export function buildUpiAppLinks(params: UpiPaymentParams) {
  const rawUri = buildUpiUri(params);
  const queryStr = rawUri.replace(/^upi:\/\/pay\?/, "");
  return {
    universal: rawUri,
    googlePay: `gpay://upi/pay?${queryStr}`,
    phonePe: `phonepe://pay?${queryStr}`,
    paytm: `paytmmp://pay?${queryStr}`,
    bhim: `bhim://pay?${queryStr}`,
  };
}
