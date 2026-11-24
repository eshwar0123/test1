import { PAYEE, SELLER, fmtDateTime } from "./paymentConfig";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* Indian-numbering amount in words:
 * 1234.5 → "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const below1000 = (n) =>
  `${n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : ""}${below100(n % 100)}`;
const wordsInt = (n) => {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${below100(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(" ");
};
export const amountInWords = (amount) => {
  const total = Math.round(Number(amount || 0) * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  return `Rupees ${wordsInt(rupees)}${paise ? ` and ${below100(paise)} Paise` : ""} Only`;
};

const line = (v) => (v ? `${esc(v)}<br>` : "");

/* Writes a printable invoice into `win` and opens the print dialog
 * ("Save as PDF" gives the downloadable file). All values are escaped. */
export function printInvoice(win, inv) {
  const b = inv.buyer || {};
  const amount = Number(inv.amount || 0);
  const rate = Number(SELLER.gstRate || 0);
  const isTax = !!SELLER.gstin;

  // GST is treated as included in the amount paid.
  const taxable = rate > 0 ? amount / (1 + rate / 100) : amount;
  const tax = amount - taxable;
  const sameState =
    SELLER.state && b.state &&
    SELLER.state.trim().toLowerCase() === String(b.state).trim().toLowerCase();

  const taxRows = rate > 0
    ? (sameState
        ? `<tr><td colspan="2" class="r">CGST @ ${rate / 2}%</td><td class="r">${money(tax / 2)}</td></tr>
           <tr><td colspan="2" class="r">SGST @ ${rate / 2}%</td><td class="r">${money(tax / 2)}</td></tr>`
        : `<tr><td colspan="2" class="r">IGST @ ${rate}%</td><td class="r">${money(tax)}</td></tr>`)
    : "";

  const buyerAddress = [b.address, b.city, [b.state, b.pin].filter(Boolean).join(" - "), b.country]
    .filter(Boolean).join(", ");

  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${isTax ? "Tax Invoice" : "Invoice"} ${esc(inv.invoice_number)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:32px;font-size:13px}
  h1{margin:0;font-size:22px;letter-spacing:1px} .muted{color:#6b7280}
  .head{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0b1f5c;padding-bottom:12px;margin-bottom:16px}
  .cols{display:flex;gap:32px;margin-bottom:18px} .cols>div{flex:1;line-height:1.55}
  table{width:100%;border-collapse:collapse;margin-bottom:12px} th{background:#0b1f5c;color:#fff;text-align:left;padding:8px}
  td{padding:8px;border-bottom:1px solid #e5e7eb;vertical-align:top} .r{text-align:right}
  .total td{font-weight:700;border-top:2px solid #0b1f5c;border-bottom:none}
  .box{border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;margin-bottom:14px;line-height:1.6}
  .sign{margin-top:36px;text-align:right}
  @media print{body{margin:12mm}}
</style></head><body>
  <div class="head">
    <div>
      <img src="${window.location.origin}/genphase_logo.png?v=2" alt="Genphase" style="height:52px;margin-bottom:10px;display:block">
      <h1>${isTax ? "TAX INVOICE" : "INVOICE"}</h1>
      <div style="margin-top:8px;line-height:1.55">
        <strong>${esc(SELLER.legalName)}</strong><br>
        ${line(SELLER.address)}${SELLER.gstin ? "GSTIN: " + esc(SELLER.gstin) + "<br>" : ""}
        ${SELLER.pan ? "PAN: " + esc(SELLER.pan) + "<br>" : ""}${line(SELLER.email)}${line(SELLER.phone)}
      </div>
    </div>
    <div class="r" style="line-height:1.7">
      <div><strong>Invoice No:</strong> ${esc(inv.invoice_number)}</div>
      <div><strong>Date &amp; time:</strong> ${esc(fmtDateTime(inv.datetime))} IST</div>
      <div><strong>Transaction ID:</strong> ${esc(inv.transaction_id)}</div>
      <div><strong>Payment mode:</strong> ${esc(inv.method)}</div>
    </div>
  </div>

  <div class="cols">
    <div><strong>Billed to</strong><br>
      ${esc(b.name)}<br>${buyerAddress ? esc(buyerAddress) + "<br>" : ""}
      ${b.gstin ? "GSTIN: " + esc(b.gstin) + "<br>" : ""}${line(b.email)}${line(b.phone)}</div>
    <div><strong>Place of supply</strong><br>${esc(b.state || "-")}<br>
      <span class="muted">Paid to UPI ID: ${esc(PAYEE.upiId)}</span></div>
  </div>

  <table>
    <thead><tr><th>#</th><th>Description of service</th>${SELLER.sac ? "<th>SAC</th>" : ""}<th class="r">Qty</th><th class="r">Taxable value (₹)</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>${esc(SELLER.serviceDescription)}</td>${SELLER.sac ? `<td>${esc(SELLER.sac)}</td>` : ""}
          <td class="r">1</td><td class="r">${money(taxable)}</td></tr>
    </tbody>
  </table>
  <table style="width:55%;margin-left:auto">
    <tbody>
      <tr><td colspan="2" class="r">Sub-total</td><td class="r">${money(taxable)}</td></tr>
      ${taxRows}
      <tr class="total"><td colspan="2" class="r">Total ${rate > 0 ? "(incl. GST) " : ""}(₹)</td><td class="r">${money(amount)}</td></tr>
    </tbody>
  </table>

  <div class="box"><strong>Amount in words:</strong> ${esc(amountInWords(amount))}<br>
    <strong>Status:</strong> Paid — received on ${esc(fmtDateTime(inv.datetime))} IST, reference ${esc(inv.transaction_id)}</div>

  <div class="sign">For ${esc(SELLER.legalName)}<br><br><br>Authorised signatory</div>
  <p class="muted" style="margin-top:20px">This is a computer-generated invoice and does not require a physical signature.</p>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`);
  win.document.close();
}
