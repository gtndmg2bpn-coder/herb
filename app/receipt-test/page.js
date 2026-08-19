// app/receipt-test/page.js
// Dev-only page to verify the receipt confirm card against the Contract B sample.
// Delete this file once the Capture Bar shell renders <ReceiptCapture /> itself.
import { ReceiptCapture } from '../../components/ReceiptCapture';

export default function ReceiptTestPage() {
  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 18, margin: '8px 0 16px' }}>Receipt capture (dev test)</h1>
      <ReceiptCapture />
    </main>
  );
}
