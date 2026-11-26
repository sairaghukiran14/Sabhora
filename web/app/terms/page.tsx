import type { Metadata } from "next";
import NextLink from "next/link";
import LegalPage from "@/components/marketing/LegalPage";
import { LEGAL } from "@/lib/legal";
import { FREE_GRANT } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Terms of use · Sabhora",
  description: "The rules for using Sabhora, what its AI results are and are not, and your rights to your content.",
};

export default function TermsPage() {
  const contact = LEGAL.contactEmail || "the contact address on our Privacy policy page";
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          These terms are an agreement between you and {LEGAL.company} about using{" "}
          {LEGAL.product}. By creating an account you accept them. If you don&apos;t agree, please
          don&apos;t use {LEGAL.product}. Our <NextLink href="/privacy">Privacy policy</NextLink>{" "}
          explains how we handle your data.
        </p>
      }
      sections={[
        {
          id: "what",
          heading: "What Sabhora is",
          body: (
            <>
              <p>
                {LEGAL.product} puts your idea before panels of <strong>AI-generated personas</strong>:
                investor characters (Sharks), a simulated crowd of Indian consumers (Janta) and
                landing-page reviewers (Roast). Every reply, score, vote, offer and verdict is
                written by AI models and is labelled as AI-generated.
              </p>
              <p>
                The personas are <strong>fictional characters</strong>. They are not real
                investors, customers or reviewers, and they are not modelled on any real person.
              </p>
            </>
          ),
        },
        {
          id: "not-advice",
          heading: "Simulations, not advice",
          body: (
            <ul>
              <li>Results are a quick way to find objections worth testing with real people. They do not predict whether your business will succeed, raise money or find customers.</li>
              <li>Crowd votes and &quot;would pay&quot; figures are simulated reactions, not survey data or demand forecasts.</li>
              <li>Nothing on {LEGAL.product} is investment, financial, legal, tax or professional advice. Check anything important with a qualified person.</li>
              <li>AI can be wrong, inconsistent or make things up, including numbers. Don&apos;t rely on a result without checking it.</li>
            </ul>
          ),
        },
        {
          id: "deals",
          heading: "Practice deals",
          body: (
            <p>
              Offers, counters and accepted deals in the Sharks room are <strong>practice only</strong>.
              No money, shares or other rights change hands, nobody is bound by them, and they are
              not an offer of securities or an invitation to invest.
            </p>
          ),
        },
        {
          id: "account",
          heading: "Your account",
          body: (
            <ul>
              <li>You must be 18 or older and give us accurate details.</li>
              <li>Keep your password safe. You are responsible for what happens under your account.</li>
              <li>One person per account. Don&apos;t create accounts to collect extra free credits.</li>
            </ul>
          ),
        },
        {
          id: "content",
          heading: "Your content",
          body: (
            <>
              <p>
                <strong>You own what you submit</strong> (your ideas, answers and the results
                generated for you). You give us permission to store it, send it to our AI
                providers and show it back to you, only to run {LEGAL.product} for you. If you make
                a run public with a share link, you also let us show it to anyone who has the link.
              </p>
              <p>Only submit content you have the right to use. Don&apos;t submit:</p>
              <ul>
                <li>someone else&apos;s confidential information or trade secrets;</li>
                <li>other people&apos;s personal data, such as customer lists or contact details;</li>
                <li>anything unlawful, hateful, sexually explicit, or that infringes someone&apos;s rights.</li>
              </ul>
            </>
          ),
        },
        {
          id: "use",
          heading: "Fair use",
          body: (
            <>
              <p>Please don&apos;t:</p>
              <ul>
                <li>send Roast a page you aren&apos;t allowed to have reviewed, or a private or internal address;</li>
                <li>try to break, overload or get around our limits, security or credit system;</li>
                <li>scrape {LEGAL.product}, or use it to build a competing service;</li>
                <li>present AI results as statements by real people or real investors;</li>
                <li>use {LEGAL.product} to mislead investors, customers or anyone else.</li>
              </ul>
              <p>We may limit how much you can use {LEGAL.product}, for example runs per hour.</p>
            </>
          ),
        },
        {
          id: "credits",
          heading: "Credits",
          body: (
            <ul>
              <li>Runs cost credits, shown before you start. New accounts get {FREE_GRANT} free credits once.</li>
              <li>Credits are held when a run starts, kept when it finishes with a verdict, and refunded automatically if it doesn&apos;t.</li>
              <li>Credits have no cash value and can&apos;t be transferred or exchanged for money.</li>
              <li>Paid plans and credit packs are not on sale yet. Prices, taxes and refund rules will be shown, and added to these terms, before you can buy anything.</li>
            </ul>
          ),
        },
        {
          id: "availability",
          heading: "Changes and availability",
          body: (
            <p>
              {LEGAL.product} is in early testing. Features, personas, prices and limits may change,
              and the service may sometimes be unavailable. We will try to give notice of
              important changes.
            </p>
          ),
        },
        {
          id: "ending",
          heading: "Ending your use",
          body: (
            <p>
              You can delete your account at any time from Settings. We may suspend or close an
              account that breaks these terms or puts other users or the service at risk, and we
              will tell you why unless the law prevents it. Unused free credits end with the
              account.
            </p>
          ),
        },
        {
          id: "liability",
          heading: "Our responsibility",
          body: (
            <>
              <p>
                We provide {LEGAL.product} &quot;as is&quot;. To the extent the law allows, we are not
                responsible for decisions you make based on its results, or for indirect losses
                such as lost profits or lost opportunities.
              </p>
              <p>
                Where we are responsible, our total liability is limited to the amount you paid us
                in the 12 months before the claim (or ₹1,000 if you paid nothing). Nothing in these
                terms limits rights that Indian consumer law gives you and that can&apos;t be waived.
              </p>
            </>
          ),
        },
        {
          id: "law",
          heading: "Law and disputes",
          body: (
            <p>
              These terms are governed by the laws of India. If a dispute can&apos;t be settled by
              talking to us first at {contact}, the courts at {LEGAL.jurisdiction} will have
              jurisdiction.
            </p>
          ),
        },
        {
          id: "changes",
          heading: "Changes to these terms",
          body: (
            <p>
              We will post changes here and update the date at the top. If a change matters, we
              will also tell you by email or in the app before it applies. Continuing to use{" "}
              {LEGAL.product} after that means you accept the new terms.
            </p>
          ),
        },
      ]}
    />
  );
}
