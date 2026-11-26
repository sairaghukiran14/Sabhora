/**
 * The facts the Terms and Privacy pages depend on, in one place.
 *
 * Everything marked "fill in" must be real before launch: the company is not registered
 * yet, so there is no legal name, address or mailbox to publish. While `ready` is false the
 * pages say they are a draft instead of showing invented details. Have an Indian lawyer
 * review both pages before setting it to true (written 27 Nov 2026 against the DPDP Act
 * 2023, the DPDP Rules 2025 and the IT Rules 2021 as amended in 2026).
 */
export const LEGAL = {
  ready: false,
  product: "Sabhora",
  company: "Neevora Labs", // fill in: the registered legal name, e.g. "Neevora Labs Private Limited"
  address: "", // fill in: registered office address
  contactEmail: "", // fill in: e.g. hello@ (general questions)
  grievanceOfficer: { name: "", email: "" }, // fill in: a named person (IT Rules 2021, rule 3(2))
  jurisdiction: "Bengaluru, Karnataka", // fill in: confirm the city whose courts will hear disputes
  updated: "27 November 2026",
  // Who processes data for us. Keep in step with backend/.env and web/.env.local.
  processors: [
    { name: "Sarvam AI", role: "Plays the personas (investors, crowd, reviewers) and answers follow-up chats", where: "India" },
    { name: "Anthropic (Claude)", role: "Writes the final verdicts", where: "United States" },
    { name: "Neon", role: "Hosts our database", where: "Singapore (AWS ap-southeast-1)" },
  ],
} as const;

export const contactLine = (email: string, fallback: string) => email || fallback;
