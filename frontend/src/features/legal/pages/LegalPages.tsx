/**
 * Legal pages (launch-readiness phase A): Terms of use, Privacy notice (India DPDP Act 2023) and the
 * Refund & cancellation policy. They are TEMPLATES written from how the product works; a lawyer must
 * review them before launch. Placeholders are in [square brackets].
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuTriangleAlert } from 'react-icons/lu';
import { useDocumentTitle } from '@/lib/documentTitle';

const UPDATED = '22 November 2026';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <article className="page legal">
      <header>
        <h1 className="page__title">{title}</h1>
        <p className="small muted">Last updated {UPDATED}</p>
      </header>
      <div className="note note--warn legal__draft" role="note">
        <LuTriangleAlert aria-hidden />
        <span>
          <strong>Draft for legal review.</strong> This prototype text describes how Webinger Collab works. It must be reviewed by a lawyer before launch; items in [brackets] are
          placeholders.
        </span>
      </div>
      {children}
      <nav className="legal__nav" aria-label="Legal pages">
        <Link to="/terms" className="link">Terms of use</Link>
        <Link to="/privacy" className="link">Privacy notice</Link>
        <Link to="/refunds" className="link">Refund &amp; cancellation policy</Link>
      </nav>
    </article>
  );
}

const Grievance = () => (
  <section>
    <h2>Grievance Officer</h2>
    <p>
      Under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 and the Digital Personal Data Protection Act, 2023, you can contact our
      Grievance Officer: <strong>[Name]</strong>, [Company legal name], [registered address], <strong>[grievance@example.com]</strong>. We acknowledge complaints within 24 hours
      and resolve them within 15 days.
    </p>
  </section>
);

export function TermsPage() {
  return (
    <LegalLayout title="Terms of use">
      <section>
        <h2>1. Who we are</h2>
        <p>
          Webinger Collab is operated by [Company legal name], [CIN], [registered address] (“we”). It is an online marketplace that connects brands with creators. We are not a party to
          the creative work agreed between a brand and a creator; we provide the platform, hold payments safely and help resolve disputes.
        </p>
      </section>
      <section>
        <h2>2. Accounts</h2>
        <ul>
          <li>You must be at least 18 years old, or have a parent or guardian’s verifiable consent, and give accurate information.</li>
          <li>Brands sign up as a business. Creators must verify their email and, to be paid, their PAN and bank account or UPI ID.</li>
          <li>Keep your password safe. You are responsible for activity on your account.</li>
          <li>Creator profiles are reviewed by our team before they appear in search. We may decline or remove profiles that break these terms.</li>
        </ul>
      </section>
      <section>
        <h2>3. Orders and payments</h2>
        <ul>
          <li>Prices are in Indian rupees. At checkout the brand pays the creator’s price, a service fee and the applicable GST, through our payment partner Razorpay.</li>
          <li>The payment is held when the order is placed and charged only when the creator accepts. It stays in escrow until the brand approves the work, or 72 hours after delivery if the brand does nothing.</li>
          <li>Creators receive the price minus our commission, GST on the commission and taxes we must withhold by law (TDS under section 194-O of the Income-tax Act and, for GST-registered creators, TCS under section 52 of the CGST Act).</li>
          <li>Fees are shown before you pay and are fixed for that order. See the <Link to="/refunds" className="link">Refund &amp; cancellation policy</Link> for what happens when an order does not go ahead.</li>
        </ul>
      </section>
      <section>
        <h2>4. Content and usage rights</h2>
        <p>
          Creators keep ownership of their content. When an order is completed, the brand may use the delivered content as described in the package, including any paid usage rights
          (for example paid ads for a set number of days). Anything beyond that needs the creator’s written agreement.
        </p>
      </section>
      <section>
        <h2>5. Staying on the platform</h2>
        <p>
          To keep payments protected, brands and creators who meet here agree not to arrange paid work for each other outside Webinger Collab for [12] months after their first
          contact. Contact details are hidden in messages until an order is completed.
        </p>
      </section>
      <section>
        <h2>6. Conduct</h2>
        <p>No fake followers or engagement, misleading content, spam, harassment or illegal content. Paid posts must follow the ASCI guidelines on influencer advertising (clear disclosure such as #ad).</p>
      </section>
      <section>
        <h2>7. Disputes</h2>
        <p>
          If a delivery does not match the brief, the brand can ask for up to two revisions or open a dispute within 72 hours of delivery. Our team reviews the brief, chat and delivery
          and may release the payment or refund it in full or in part. Our decision on how the escrowed money is paid out is final for the platform; it does not limit your legal rights.
        </p>
      </section>
      <section>
        <h2>8. Suspension and closure</h2>
        <p>We may suspend accounts that break these terms. You can close your account at any time from Account settings; open orders and balances must be settled first.</p>
      </section>
      <section>
        <h2>9. Liability and law</h2>
        <p>
          To the extent the law allows, our liability for any claim is limited to the fees we earned on the order concerned. These terms are governed by the laws of India; courts in
          [city] have jurisdiction.
        </p>
      </section>
      <Grievance />
    </LegalLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy notice">
      <p>
        This notice explains how [Company legal name] (the “Data Fiduciary”) processes your personal data under the Digital Personal Data Protection Act, 2023 (DPDP Act). By creating
        an account you consent to this processing for the purposes below; you can withdraw consent at any time.
      </p>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account: name, email, password (stored only as a secure hash), role.</li>
          <li>Creators: profile, photos, social handles and follower counts, packages, portfolio; for payouts PAN, bank account or UPI ID and optional GSTIN.</li>
          <li>Brands: company details, GSTIN and state for tax invoices; payment method tokens (card numbers are held by Razorpay, never by us).</li>
          <li>Activity: orders, briefs, deliveries, messages, reviews, notifications, and technical logs (IP address, device) for security.</li>
        </ul>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To run the marketplace: profiles, search, orders, escrow payments, payouts, messages and support.</li>
          <li>To meet legal duties: tax invoices, GST and TDS/TCS records, fraud prevention and responding to lawful requests.</li>
          <li>To keep the platform safe: reviewing creators, handling reports and disputes.</li>
        </ul>
        <p>We do not sell your personal data.</p>
      </section>
      <section>
        <h2>Who we share it with</h2>
        <p>
          Our processors, under contract: Razorpay (payments, payouts, KYC), [cloud hosting provider] (servers and file storage), [email/SMS/WhatsApp provider] (notifications). Brands and
          creators see each other’s profile and order details; contact details stay hidden until an order is completed. Data may be processed outside India where the law allows.
        </p>
      </section>
      <section>
        <h2>How long we keep it</h2>
        <p>
          While your account is open. After you delete it, we erase or anonymise your data within 30 days, except records we must keep by law — invoices, payment and tax records (up to 8
          years) — and data needed for an open dispute.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <ul>
          <li>Access a summary of your data — use “Download my data” in Account settings.</li>
          <li>Correct or update it — in your profile and Account settings.</li>
          <li>Erase it and withdraw consent — use “Delete my account” in Account settings.</li>
          <li>Nominate someone to exercise your rights if you cannot.</li>
          <li>Raise a grievance with us, and then with the Data Protection Board of India.</li>
        </ul>
      </section>
      <section>
        <h2>Children</h2>
        <p>Webinger Collab is for people aged 18 and over. Creators under 18 need verifiable consent from a parent or guardian before we process their data.</p>
      </section>
      <Grievance />
    </LegalLayout>
  );
}

export function RefundsPage() {
  return (
    <LegalLayout title="Refund & cancellation policy">
      <section>
        <h2>Before the creator accepts</h2>
        <ul>
          <li>Your payment is only held (authorised), not charged.</li>
          <li>If you cancel, the creator declines, or the creator doesn’t respond within 72 hours, the hold is released. Nothing is deducted.</li>
          <li>Depending on your bank, the held amount disappears from your statement within 5–7 working days.</li>
        </ul>
      </section>
      <section>
        <h2>After the creator accepts</h2>
        <ul>
          <li>The payment is charged and held in escrow — the creator is not paid until you approve the work.</li>
          <li>You can ask for up to two revisions if the delivery doesn’t match the brief.</li>
          <li>If something goes wrong, open a dispute within 72 hours of delivery. Our team may release the payment, or refund you in full or in part.</li>
          <li>If a creator stops responding after accepting, contact us: our team can cancel the order and refund you in full.</li>
        </ul>
      </section>
      <section>
        <h2>How refunds are paid</h2>
        <ul>
          <li>Refunds go back to the original payment method (card, UPI, netbanking or wallet) within 5–7 working days of our decision.</li>
          <li>A full refund includes the service fee and GST. A partial refund is taken from the creator’s share; the service fee is not refunded.</li>
          <li>Approved orders, and orders approved automatically after 72 hours, cannot be refunded.</li>
        </ul>
      </section>
      <section>
        <h2>Creators</h2>
        <p>Creators can decline any order before accepting. After accepting, a creator who cannot deliver should tell the brand in the order chat and contact us.</p>
      </section>
      <Grievance />
    </LegalLayout>
  );
}
