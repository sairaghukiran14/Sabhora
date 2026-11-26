import type { Metadata } from "next";
import NextLink from "next/link";
import LegalPage from "@/components/marketing/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy · Sabhora",
  description: "What Sabhora collects, why, who processes it, how long we keep it and how to delete it.",
};

// Every statement here must stay true to the code. Inventory as of 27 Nov 2026:
// db/migrations/001_init.sql (tables), web/lib/session.ts (cookie), web/app/actions/account.ts
// (deleteAccount erases runs and the engine's copies), backend/app/chat.py (no chats stored).
export default function PrivacyPage() {
  const contact = LEGAL.contactEmail || "the contact address we will publish here before launch";
  const go = LEGAL.grievanceOfficer;
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          {LEGAL.product} is run by {LEGAL.company}. This page explains, in plain words, what we
          collect when you use {LEGAL.product}, why, who else handles it, and how you can see,
          correct or delete it. We wrote it for India&apos;s Digital Personal Data Protection Act,
          2023. Its main duties start in 2027, but we follow it now.
        </p>
      }
      sections={[
        {
          id: "what",
          heading: "What we collect",
          body: (
            <>
              <ul>
                <li><strong>Account:</strong> your name, email address and password. We store only a scrambled hash of your password (scrypt), never the password itself.</li>
                <li><strong>Profile, if you fill it in:</strong> role, company, city and a short bio, and your display preferences.</li>
                <li><strong>What you submit:</strong> your idea, target customer, price, your ask (amount and equity), your answers to the sharks, your deal choices, and landing-page addresses you send to Roast.</li>
                <li><strong>Results:</strong> everything the AI personas and judges write about your submission.</li>
                <li><strong>Credits:</strong> a record of credits granted, held, used and refunded.</li>
                <li><strong>Sign-in:</strong> a random session token in a cookie (stored by us only as a hash), the browser type it came from, and when it expires.</li>
                <li><strong>API keys, if you save one:</strong> stored encrypted; we show only the last four characters.</li>
              </ul>
              <p>
                We do <strong>not</strong> collect your phone number, location, contacts or
                payment card details, and we do not use advertising or analytics trackers. To
                stop abuse we count requests per IP address in memory; those counts are not
                saved and reset when the server restarts.
              </p>
            </>
          ),
        },
        {
          id: "why",
          heading: "Why we use it",
          body: (
            <ul>
              <li>To run the rooms you ask for (Sharks, Janta, Roast) and show you the results.</li>
              <li>To keep you signed in, protect your account and stop misuse.</li>
              <li>To keep your credit balance correct, including refunds when a run fails.</li>
              <li>To answer you when you write to us.</li>
            </ul>
          ),
        },
        {
          id: "ai",
          heading: "Who else handles your data",
          body: (
            <>
              <p>
                To generate the personas&apos; replies we send your submission, and what the
                panel has said so far, to these AI and hosting providers. They process it to
                produce the replies; their own terms set how long they keep it.
              </p>
              <ul>
                {LEGAL.processors.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong> ({p.where}): {p.role}.
                  </li>
                ))}
              </ul>
              <p>
                Some of these providers are outside India, so your data may be processed abroad.
                We do not sell your data and we do not share it for advertising. We would only
                disclose it otherwise if Indian law requires us to.
              </p>
            </>
          ),
        },
        {
          id: "share",
          heading: "Share links",
          body: (
            <p>
              A run is private until you press <strong>Share verdict</strong>. Then anyone with
              its link can see your idea and the whole debate, without signing in. Press{" "}
              <strong>Make private</strong> to turn the link off at any time.
            </p>
          ),
        },
        {
          id: "chats",
          heading: "Follow-up chats",
          body: (
            <p>
              When you chat with a persona after a verdict, the conversation stays in your browser
              tab. Each message is sent to the AI provider with the debate so the persona can
              reply, but our servers do not store chats. Closing the tab ends the chat.
            </p>
          ),
        },
        {
          id: "keep",
          heading: "How long we keep it",
          body: (
            <ul>
              <li>Your account and runs: until you delete them.</li>
              <li>Sign-in sessions: until they expire (30 days at most if you choose to stay signed in) or you sign out.</li>
              <li>Password-reset links: until they are used or expire.</li>
              <li>
                Our database provider keeps short-term backups so it can recover from failures. A
                deleted item can stay in those backups until they expire.
              </li>
            </ul>
          ),
        },
        {
          id: "rights",
          heading: "Your rights and choices",
          body: (
            <>
              <ul>
                <li><strong>See and correct:</strong> your profile and runs are in your dashboard; edit your details under <NextLink href="/dashboard/profile">Profile</NextLink>.</li>
                <li><strong>Delete a run:</strong> from the run page. This also erases our AI engine&apos;s copy.</li>
                <li><strong>Delete your account:</strong> under <NextLink href="/dashboard/settings">Settings</NextLink>. This erases your account, runs, credits history, sessions and saved keys straight away, apart from the backups described above.</li>
                <li><strong>Withdraw consent:</strong> deleting your account withdraws it. Processing before that stays lawful.</li>
                <li><strong>Ask us anything or complain:</strong> write to {contact}. We acknowledge a complaint within 24 hours and resolve it within 7 days.</li>
              </ul>
              <p>
                If you are not satisfied with our answer, you may complain to the Data Protection
                Board of India.
              </p>
            </>
          ),
        },
        {
          id: "security",
          heading: "Security",
          body: (
            <p>
              Connections are encrypted (HTTPS), passwords are hashed, session tokens are stored
              only as hashes, saved API keys are encrypted, and only our web server can talk to
              the AI engine. No system is perfectly secure. If a breach affects your data we will
              tell you and the Data Protection Board as the law requires.
            </p>
          ),
        },
        {
          id: "children",
          heading: "Children",
          body: <p>{LEGAL.product} is for people aged 18 and over. We do not knowingly collect data from children.</p>,
        },
        {
          id: "contact",
          heading: "Contact and grievance officer",
          body: (
            <>
              <p>
                {LEGAL.company}
                {LEGAL.address ? `, ${LEGAL.address}` : ""}.
              </p>
              <p>
                Grievance officer:{" "}
                {go.name && go.email ? `${go.name}, ${go.email}` : "to be named here before launch"}.
              </p>
              <p>We will post any change to this policy on this page and update the date at the top.</p>
            </>
          ),
        },
      ]}
    />
  );
}
