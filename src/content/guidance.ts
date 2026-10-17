/**
 * Curated, versioned Help content (jurisdiction: India, national level).
 * Every item was checked against the linked official page on 2026-10-17.
 * See SOURCES.md for what each source supports and its freshness limits.
 * Only items from this allowlist may be shown or given to the AI as context.
 * Excluded because they could not be verified: a Samadhan/Shram Suvidha route
 * for gig workers, a live PM-JAY cover specifically for platform workers,
 * an operational gig-worker helpline under the Social Security Code, any
 * minimum-payout guarantee, and rider fatigue guidance.
 */

export const GUIDANCE_VERSION = "2026-10-17.1";

export type GuidanceSection = "payment" | "safety" | "welfare";

export interface GuidanceItem {
  id: string;
  section: GuidanceSection;
  title: { en: string; hi: string };
  summary: { en: string; hi: string };
  nextStep: { en: string; hi: string };
  source: { title: string; url: string | null; publisher: string };
  reviewedOn: string;
  needsHumanVerification: boolean;
}

export const GUIDANCE: GuidanceItem[] = [
  {
    id: "keep-proof-ask-platform",
    section: "payment",
    title: { en: "Keep proof and ask the platform first", hi: "सबूत संभालकर रखें, पहले कंपनी से पूछें" },
    summary: {
      en: "Save screenshots of your earnings page, order history, payout messages and bank or UPI credits as soon as you notice a problem. Write down dates, order IDs and amounts. Then ask the platform's support, in writing, to explain the gap.",
      hi: "जैसे ही पैसे में गड़बड़ी दिखे, कमाई वाले पेज, ऑर्डर हिस्ट्री, पेमेंट मैसेज और बैंक या UPI में आए पैसे के स्क्रीनशॉट ले लें। तारीख, ऑर्डर नंबर और रकम लिख लें। फिर कंपनी के सपोर्ट से लिखकर पूछें कि पैसा कम क्यों आया।",
    },
    nextStep: {
      en: "Today, take screenshots of the payout you're unsure about and send a short written question to the app's support.",
      hi: "आज ही गड़बड़ वाले पेमेंट का स्क्रीनशॉट लें और ऐप के सपोर्ट में छोटा लिखित सवाल भेजें।",
    },
    source: { title: "Practice guidance (no legal source)", url: null, publisher: "HaqCheck" },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "social-security-code-gig-workers",
    section: "payment",
    title: { en: "Gig workers under the Social Security Code", hi: "सोशल सिक्योरिटी कोड में गिग वर्कर" },
    summary: {
      en: "The Code on Social Security, 2020 came into force on 21 November 2025 and recognises gig and platform workers in law. It covers registration on e-Shram, a Social Security Fund that aggregators contribute to, and benefits the government notifies through schemes. It does not by itself fix your pay rate or guarantee a minimum payout.",
      hi: "सोशल सिक्योरिटी कोड, 2020 21 नवंबर 2025 से लागू है। इसमें गिग और प्लेटफ़ॉर्म वर्कर को कानूनी पहचान मिली है। इसमें e-Shram पर रजिस्ट्रेशन, कंपनियों के योगदान से बनने वाला सोशल सिक्योरिटी फ़ंड और सरकार की योजनाओं से मिलने वाले फ़ायदे शामिल हैं। यह कानून अपने-आप आपकी कमाई की दर या न्यूनतम भुगतान तय नहीं करता।",
    },
    nextStep: {
      en: "Register on e-Shram so you can be linked to schemes notified for platform workers.",
      hi: "e-Shram पर रजिस्टर करें, ताकि प्लेटफ़ॉर्म वर्कर के लिए आने वाली योजनाओं से जुड़ सकें।",
    },
    source: {
      title: "Labour Reforms: Formalising and Safeguarding India's Gig & Platform Workforce",
      url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2200767",
      publisher: "Press Information Bureau / Ministry of Labour & Employment",
    },
    reviewedOn: "2026-10-17",
    needsHumanVerification: true,
  },
  {
    id: "nalsa-free-legal-aid",
    section: "payment",
    title: { en: "Free legal help (NALSA 15100)", hi: "मुफ़्त कानूनी मदद (NALSA 15100)" },
    summary: {
      en: "Legal Services Authorities give free legal help to certain groups, including industrial workmen, women, SC/ST members and people below a state-set income limit. You can ask at the district legal services office, online, or by calling the toll-free NALSA helpline 15100. Whether your case qualifies depends on your situation.",
      hi: "कानूनी सेवा प्राधिकरण कुछ लोगों को मुफ़्त कानूनी मदद देते हैं, जैसे औद्योगिक कामगार, महिलाएं, SC/ST और राज्य की तय आय सीमा से कम कमाने वाले लोग। आप ज़िले के कानूनी सेवा दफ़्तर में, ऑनलाइन, या NALSA की टोल-फ़्री हेल्पलाइन 15100 पर कॉल करके मदद मांग सकते हैं। मदद मिलेगी या नहीं, यह आपके मामले पर निर्भर है।",
    },
    nextStep: {
      en: "Call 15100 and ask whether you can get free legal aid for your payment problem.",
      hi: "15100 पर कॉल करें और पूछें कि क्या आपके पेमेंट की समस्या में मुफ़्त कानूनी मदद मिल सकती है।",
    },
    source: { title: "NALSA FAQs", url: "https://nalsa.gov.in/faqs/", publisher: "National Legal Services Authority" },
    reviewedOn: "2026-10-17",
    needsHumanVerification: true,
  },
  {
    id: "emergency-112",
    section: "safety",
    title: { en: "112 for any emergency", hi: "किसी भी इमरजेंसी में 112" },
    summary: {
      en: "112 is India's single emergency number. It connects you to police and other emergency help through your state's response centre. For road accidents, the 112 operator can guide you to a designated hospital and arrange an ambulance if needed.",
      hi: "112 भारत का एक ही इमरजेंसी नंबर है। इससे आपके राज्य के कंट्रोल रूम के ज़रिए पुलिस और दूसरी इमरजेंसी मदद मिलती है। सड़क हादसे में 112 वाले नज़दीकी तय अस्पताल तक पहुँचने में मदद करते हैं और ज़रूरत हो तो एम्बुलेंस भेजते हैं।",
    },
    nextStep: { en: "Save 112 in your phone.", hi: "112 नंबर फ़ोन में सेव करें।" },
    source: {
      title: "Cashless Treatment to Road Accident Victims",
      url: "https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2220125",
      publisher: "Press Information Bureau / Ministry of Road Transport & Highways",
    },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "ambulance-108-highway-1033",
    section: "safety",
    title: { en: "108 ambulance and 1033 highway help", hi: "108 एम्बुलेंस और 1033 हाईवे हेल्पलाइन" },
    summary: {
      en: "Dial 108 for an emergency ambulance. It is run by state governments, so it may work a little differently from state to state. On National Highways, NHAI's toll-free 1033 runs 24×7 for accidents, breakdowns and blocked roads.",
      hi: "इमरजेंसी एम्बुलेंस के लिए 108 डायल करें। यह सेवा राज्य सरकारें चलाती हैं, इसलिए हर राज्य में थोड़ा फ़र्क हो सकता है। नेशनल हाईवे पर NHAI का टोल-फ़्री नंबर 1033 चौबीसों घंटे हादसे, गाड़ी खराब होने या रास्ता रुकने पर मदद करता है।",
    },
    nextStep: { en: "Save 108 and 1033 in your phone before long rides.", hi: "लंबे सफ़र से पहले 108 और 1033 फ़ोन में सेव करें।" },
    source: {
      title: "NHM ambulance services; NHAI 'Dial 1033' (PIB PRID 2265867)",
      url: "https://nhm.gov.in/index1.php?lang=1&level=2&sublinkid=1217&lid=189",
      publisher: "National Health Mission; Press Information Bureau / NHAI",
    },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "helmet-bis-certified",
    section: "safety",
    title: { en: "Wear an ISI-marked helmet", hi: "ISI मार्क वाला हेलमेट पहनें" },
    summary: {
      en: "Wearing a helmet on a two-wheeler is required under the Motor Vehicles Act, 1988. The government asks riders to use only BIS-certified, ISI-marked helmets (IS 4151:2015).",
      hi: "मोटर वाहन कानून, 1988 के तहत दोपहिया चलाते समय हेलमेट पहनना ज़रूरी है। सरकार कहती है कि सिर्फ़ BIS से प्रमाणित, ISI मार्क वाला हेलमेट (IS 4151:2015) ही इस्तेमाल करें।",
    },
    nextStep: {
      en: "Check your helmet for the ISI mark and IS 4151 label.",
      hi: "अपने हेलमेट पर ISI मार्क और IS 4151 लिखा है या नहीं, देखें।",
    },
    source: {
      title: "Centre urges consumers to use only BIS certified helmets",
      url: "https://www.pib.gov.in/PressReleseDetailm.aspx?PRID=2142409",
      publisher: "Press Information Bureau / Department of Consumer Affairs",
    },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "heatwave-outdoor-work",
    section: "safety",
    title: { en: "Staying safe in a heat wave", hi: "लू (हीट वेव) में खुद को बचाएं" },
    summary: {
      en: "Drink water often, even if you are not thirsty, and carry water while riding. Cover your head and use a damp cloth on your neck and face. Where you can, avoid working outside between 12 noon and 3 pm. ORS, lemon water, lassi or buttermilk help you rehydrate.",
      hi: "प्यास न लगे तब भी बार-बार पानी पिएं और गाड़ी चलाते समय पानी साथ रखें। सिर ढकें और गर्दन व चेहरे पर गीला कपड़ा रखें। जहाँ हो सके, दोपहर 12 से 3 बजे के बीच बाहर काम करने से बचें। ORS, नींबू पानी, लस्सी या छाछ से शरीर में पानी की कमी पूरी होती है।",
    },
    nextStep: {
      en: "If someone shows signs of heat stroke, move them to shade, cool them with water and take them to the nearest health centre at once.",
      hi: "किसी को लू लगे तो उसे छांव में ले जाएं, पानी से शरीर ठंडा करें और तुरंत नज़दीकी अस्पताल ले जाएं।",
    },
    source: { title: "Heat Wave: Do's & Don'ts", url: "https://ndma.gov.in/en/heat-wave-dos-donts", publisher: "National Disaster Management Authority" },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "eshram-registration",
    section: "welfare",
    title: { en: "Register on e-Shram", hi: "e-Shram पर रजिस्टर करें" },
    summary: {
      en: "e-Shram is the government's national database of unorganised workers, including gig and platform workers. If you are 16 or older, do unorganised work and are not an EPFO or ESIC member, you can register free with your Aadhaar number and Aadhaar-linked mobile. Registering does not by itself pay you money; it helps link you to schemes you may be eligible for.",
      hi: "e-Shram असंगठित कामगारों का सरकारी राष्ट्रीय डेटाबेस है, जिसमें गिग और प्लेटफ़ॉर्म वर्कर भी शामिल हैं। अगर आपकी उम्र 16 साल या ज़्यादा है, आप असंगठित काम करते हैं और EPFO या ESIC के सदस्य नहीं हैं, तो आधार नंबर और आधार से जुड़े मोबाइल से मुफ़्त रजिस्टर कर सकते हैं। सिर्फ़ रजिस्टर करने से पैसा नहीं मिलता; इससे आप उन योजनाओं से जुड़ पाते हैं जिनके लिए आप पात्र हों।",
    },
    nextStep: {
      en: "Register at eshram.gov.in, or visit a Common Service Centre if your mobile is not linked to Aadhaar. Helpdesk: 14434.",
      hi: "eshram.gov.in पर रजिस्टर करें। मोबाइल आधार से नहीं जुड़ा है तो नज़दीकी CSC केंद्र जाएं। हेल्पलाइन: 14434।",
    },
    source: { title: "e-Shram FAQs", url: "https://eshram.gov.in/faqs", publisher: "Ministry of Labour & Employment" },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
  {
    id: "eshram-linked-schemes",
    section: "welfare",
    title: { en: "Schemes linked through e-Shram", hi: "e-Shram से जुड़ी योजनाएं" },
    summary: {
      en: "Several central schemes are linked to e-Shram, such as PM Suraksha Bima Yojana and PM Jeevan Jyoti Bima Yojana. Each scheme has its own eligibility rules and you usually apply separately. Health cover under PM-JAY for platform workers has been announced, but we could not confirm it is fully live.",
      hi: "कई केंद्रीय योजनाएं e-Shram से जुड़ी हैं, जैसे प्रधानमंत्री सुरक्षा बीमा योजना और प्रधानमंत्री जीवन ज्योति बीमा योजना। हर योजना की अपनी शर्तें हैं और आम तौर पर अलग से आवेदन करना पड़ता है। प्लेटफ़ॉर्म वर्कर के लिए PM-JAY इलाज कवर की घोषणा हुई है, पर यह पूरी तरह शुरू हुआ है या नहीं, हम पक्का नहीं कर पाए।",
    },
    nextStep: {
      en: "After registering, log in to e-Shram and look for 'Apply' buttons in the scheme list.",
      hi: "रजिस्ट्रेशन के बाद e-Shram में लॉग इन करें और योजनाओं की लिस्ट में 'Apply' बटन देखें।",
    },
    source: {
      title: "Social Security for Gig and Platform Workers (PIB PRID 2220307)",
      url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2220307",
      publisher: "Press Information Bureau / Ministry of Labour & Employment",
    },
    reviewedOn: "2026-10-17",
    needsHumanVerification: true,
  },
  {
    id: "myscheme-discovery",
    section: "welfare",
    title: { en: "Find schemes on myScheme", hi: "myScheme पर योजनाएं खोजें" },
    summary: {
      en: "myScheme is the government's official site for finding central and state schemes in one place. Answer a few questions to see schemes you may be eligible for and read how to apply. Applications are usually made on each scheme's own portal.",
      hi: "myScheme सरकार की आधिकारिक वेबसाइट है, जहाँ केंद्र और राज्य की योजनाएं एक जगह मिलती हैं। कुछ सवालों के जवाब देकर देख सकते हैं कि किन योजनाओं के लिए आप पात्र हो सकते हैं, और आवेदन का तरीका पढ़ सकते हैं। आवेदन आम तौर पर हर योजना की अपनी वेबसाइट पर होता है।",
    },
    nextStep: {
      en: "Open myscheme.gov.in and use the eligibility check.",
      hi: "myscheme.gov.in खोलें और पात्रता जाँच इस्तेमाल करें।",
    },
    source: { title: "About myScheme", url: "https://www.myscheme.gov.in/about", publisher: "National e-Governance Division (MeitY)" },
    reviewedOn: "2026-10-17",
    needsHumanVerification: false,
  },
];

export function guidanceBySection(section: GuidanceSection): GuidanceItem[] {
  return GUIDANCE.filter((g) => g.section === section);
}

/** Short snippets the complaint drafter may cite. Ids are validated against this allowlist. */
export const DRAFT_GUIDANCE_IDS = ["keep-proof-ask-platform"] as const;
