export type LanguageCode = "en" | "hi" | "gu" | "mr" | "kn" | "ml" | "ta" | "te" | "or" | "bn";

export interface LanguageMeta {
  code: LanguageCode;
  nativeName: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", nativeName: "English" },
  { code: "hi", nativeName: "हिन्दी" },
  { code: "gu", nativeName: "ગુજરાતી" },
  { code: "mr", nativeName: "मराठी" },
  { code: "kn", nativeName: "ಕನ್ನಡ" },
  { code: "ml", nativeName: "മലയാളം" },
  { code: "ta", nativeName: "தமிழ்" },
  { code: "te", nativeName: "తెలుగు" },
  { code: "or", nativeName: "ଓଡ଼ିଆ" },
  { code: "bn", nativeName: "বাংলা" },
];

export interface Translations {
  header: {
    auditLog: string;
    newSession: string;
    menu: string;
    language: string;
    mute: string;
    unmute: string;
    tabScope: string;
    tabScopeSingle: string;
    tabScopeAll: string;
    visuals: string;
    visualsBoxes: string;
    visualsCursor: string;
    visualsRedact: string;
    on: string;
    off: string;
  };
  context: {
    noActiveTab: string;
  };
  empty: {
    suggestion1: string;
    suggestion2: string;
    suggestion3: string;
  };
  input: {
    placeholder: string;
    autoRedact: string;
    mic: string;
    listening: string;
    approvalMode: string;
  };
  approvalMenu: {
    manual: string;
    auto: string;
    skip: string;
  };
  card: {
    steps: string;
    statusRunning: string;
    statusAwaitingApproval: string;
    statusCompleted: string;
    statusDenied: string;
    statusStopped: string;
    statusError: string;
  };
  steps: {
    capturingLabel: string;
    capturingDetail: string;
    redactionLabel: string;
    redactionDetailMasked: string;
    redactionDetailNone: string;
    reasoningLabel: string;
    reasoningDetail: string;
    actionLabel: string;
    actionDetail: string;
    showPreview: string;
    hidePreview: string;
  };
  chips: {
    sanitizing: string;
    reasoning: string;
    executing: string;
    completed: string;
  };
  approval: {
    actionLabel: string;
    riskNote: string;
    approve: string;
    deny: string;
    approvedNote: string;
    deniedNote: string;
    expiredNote: string;
    autoNote: string;
    autoApprovedNote: string;
    stepLabel: string;
    expiresIn: string;
  };
  summary: {
    completedWithMasks: string;
    completedNoMasks: string;
    denied: string;
    stopped: string;
    error: string;
  };
  preview: {
    noRegions: string;
    footer: string;
  };
  audit: {
    title: string;
    subtitle: string;
    close: string;
    empty: string;
    maskedMessage: string;
  };
  tags: {
    CREDENTIAL: string;
    COORDINATES: string;
    FACE: string;
    ID_NUMBER: string;
    SIGNATURE: string;
  };
  notice: {
    title: string;
    body: string;
    detailHeading: string;
    detailItem1: string;
    detailItem2: string;
    detailItem3: string;
    customize: string;
    reject: string;
    accept: string;
  };
}

const en: Translations = {
  header: {
    auditLog: "Privacy audit log",
    newSession: "New session",
    menu: "More",
    language: "Language",
    mute: "Mute sounds",
    unmute: "Unmute sounds",
    tabScope: "Tab access scope",
    tabScopeSingle: "Current tab only",
    tabScopeAll: "All tabs",
    visuals: "On-page visuals",
    visualsBoxes: "Bounding boxes",
    visualsCursor: "Agent cursor",
    visualsRedact: "Auto-redact PII",
    on: "on",
    off: "off",
  },
  context: {
    noActiveTab: "No active tab",
  },
  empty: {
    suggestion1: "Sanitize and extract form summary",
    suggestion2: "Navigate to disaster layers on Bhuvan",
    suggestion3: "Inspect and mask visible telemetry fields",
  },
  input: {
    placeholder: "Ask V.A.R.M.A to perform a task on this page…",
    autoRedact: "Auto-redact",
    mic: "Voice input",
    listening: "Listening… tap to stop",
    approvalMode: "Approval mode",
  },
  approvalMenu: {
    manual: "Manually approve",
    auto: "Automatically approve",
    skip: "Skip all approvals",
  },
  card: {
    steps: "{n} steps",
    statusRunning: "Running…",
    statusAwaitingApproval: "Awaiting your approval",
    statusCompleted: "Completed",
    statusDenied: "Denied",
    statusStopped: "Stopped",
    statusError: "Error",
  },
  steps: {
    capturingLabel: "Capturing viewport",
    capturingDetail: "Snapshotting the visible area of {domain}",
    redactionLabel: "Local redaction",
    redactionDetailMasked: "{n} field(s) masked before capture leaves the device",
    redactionDetailNone: "No sensitive fields detected in the current viewport",
    reasoningLabel: "Server reasoning",
    reasoningDetail: "Generating action payload from the sanitized context only",
    actionLabel: "Action",
    actionDetail: "Executing synthetic interaction on the page",
    showPreview: "Show sanitized preview",
    hidePreview: "Hide sanitized preview",
  },
  chips: {
    sanitizing: "Sanitizing DOM",
    reasoning: "Server Reasoning",
    executing: "Executing Action",
    completed: "Completed",
  },
  approval: {
    actionLabel: "Submit data to {domain}",
    riskNote:
      "This step writes data to the destination server and can't be undone automatically. Review before continuing.",
    approve: "Approve action",
    deny: "Deny",
    approvedNote: "Approved — action executed.",
    deniedNote: "Denied — action was not taken.",
    expiredNote: "This request timed out before a decision was made.",
    autoNote: "Auto-approving in a moment — switch to Manual to review each step.",
    autoApprovedNote: "Auto-approved — action executed.",
    stepLabel: "Step {n}",
    expiresIn: "expires in {n}s",
  },
  summary: {
    completedWithMasks:
      "Done — {n} field(s) stayed local, action executed on the sanitized context only.",
    completedNoMasks: "Done — no sensitive fields were in scope for this step.",
    denied: "Action cancelled — nothing was submitted.",
    stopped: "Task stopped before completion.",
    error: "Something went wrong while reasoning about this task.",
  },
  preview: {
    noRegions: "No sensitive regions detected",
    footer:
      "Pixels are masked in-memory on this device. Only tagged, redacted regions are sent to the reasoning server — never raw values.",
  },
  audit: {
    title: "Privacy audit log",
    subtitle: "Every field masked on-device this session",
    close: "Close",
    empty:
      "No redactions recorded yet. This log fills in as V.A.R.M.A masks sensitive fields during a task.",
    maskedMessage: "Masked 1 {tag} field on {domain}",
  },
  tags: {
    CREDENTIAL: "Credential",
    COORDINATES: "Geospatial coordinate",
    FACE: "Face",
    ID_NUMBER: "ID number",
    SIGNATURE: "Signature",
  },
  notice: {
    title: "Your data stays on this device",
    body:
      "V.A.R.M.A redacts sensitive fields locally before anything reaches the reasoning server. This session's conversation history and redaction audit log are stored only in this browser — never sent anywhere. Accept to keep that local history when you reopen this panel, or reject to keep everything in-memory only, cleared as soon as it closes.",
    detailHeading: "Stored only in this browser, only for this session",
    detailItem1: "Conversation & task history",
    detailItem2: "Redaction audit log",
    detailItem3: "Language, sound and approval-mode preferences",
    customize: "Customize",
    reject: "Reject",
    accept: "Accept",
  },
};

const hi: Translations = {
  header: {
    auditLog: "गोपनीयता ऑडिट लॉग",
    newSession: "नया सत्र",
    menu: "अधिक",
    language: "भाषा",
    mute: "ध्वनि म्यूट करें",
    unmute: "ध्वनि चालू करें",
    tabScope: "टैब एक्सेस सीमा",
    tabScopeSingle: "केवल वर्तमान टैब",
    tabScopeAll: "सभी टैब",
    visuals: "पेज पर दृश्य",
    visualsBoxes: "बाउंडिंग बॉक्स",
    visualsCursor: "एजेंट कर्सर",
    visualsRedact: "PII स्वतः मास्क करें",
    on: "चालू",
    off: "बंद",  },
  context: {
    noActiveTab: "कोई सक्रिय टैब नहीं",
  },
  empty: {
    suggestion1: "फ़ॉर्म सारांश साफ़ करें और निकालें",
    suggestion2: "भुवन पर आपदा लेयर्स पर जाएँ",
    suggestion3: "दिखाई दे रहे टेलीमेट्री फ़ील्ड की जाँच कर मास्क करें",
  },
  input: {
    placeholder: "V.A.R.M.A से इस पेज पर कोई कार्य करने को कहें…",
    autoRedact: "ऑटो-रिडैक्ट",
    mic: "वॉइस इनपुट",
    listening: "सुन रहा है… रोकने के लिए टैप करें",
    approvalMode: "अनुमोदन मोड",
  },
  approvalMenu: {
    manual: "मैन्युअली स्वीकृत करें",
    auto: "स्वतः स्वीकृत करें",
    skip: "सभी स्वीकृतियाँ छोड़ें",
  },
  card: {
    steps: "{n} चरण",
    statusRunning: "चल रहा है…",
    statusAwaitingApproval: "आपकी स्वीकृति की प्रतीक्षा है",
    statusCompleted: "पूर्ण",
    statusDenied: "अस्वीकृत",
    statusStopped: "रोका गया",
    statusError: "त्रुटि",
  },
  steps: {
    capturingLabel: "व्यूपोर्ट कैप्चर हो रहा है",
    capturingDetail: "{domain} के दृश्य क्षेत्र का स्नैपशॉट लिया जा रहा है",
    redactionLabel: "स्थानीय रिडैक्शन",
    redactionDetailMasked: "कैप्चर डिवाइस छोड़ने से पहले {n} फ़ील्ड मास्क किए गए",
    redactionDetailNone: "वर्तमान व्यूपोर्ट में कोई संवेदनशील फ़ील्ड नहीं मिला",
    reasoningLabel: "सर्वर रीज़निंग",
    reasoningDetail: "केवल सैनिटाइज़्ड संदर्भ से एक्शन पेलोड तैयार किया जा रहा है",
    actionLabel: "एक्शन",
    actionDetail: "पेज पर सिंथेटिक इंटरैक्शन निष्पादित किया जा रहा है",
    showPreview: "सैनिटाइज़्ड प्रीव्यू दिखाएँ",
    hidePreview: "सैनिटाइज़्ड प्रीव्यू छिपाएँ",
  },
  chips: {
    sanitizing: "DOM सैनिटाइज़ हो रहा है",
    reasoning: "सर्वर रीज़निंग",
    executing: "एक्शन निष्पादित हो रहा है",
    completed: "पूर्ण",
  },
  approval: {
    actionLabel: "{domain} पर डेटा सबमिट करें",
    riskNote:
      "यह चरण गंतव्य सर्वर पर डेटा लिखता है और स्वतः पूर्ववत नहीं किया जा सकता। जारी रखने से पहले समीक्षा करें।",
    approve: "एक्शन स्वीकृत करें",
    deny: "अस्वीकार करें",
    approvedNote: "स्वीकृत — एक्शन निष्पादित हुआ।",
    deniedNote: "अस्वीकृत — कुछ भी सबमिट नहीं किया गया।",
    expiredNote: "निर्णय लेने से पहले यह अनुरोध समय-समाप्त हो गया।",
    autoNote: "कुछ क्षण में स्वतः स्वीकृत — हर चरण की समीक्षा हेतु मैनुअल चुनें।",
    autoApprovedNote: "स्वतः स्वीकृत — एक्शन निष्पादित हुआ।",
    stepLabel: "चरण {n}",
    expiresIn: "{n}सेकंड में समाप्त",
  },
  summary: {
    completedWithMasks:
      "पूर्ण — {n} फ़ील्ड डिवाइस पर ही रहे, एक्शन केवल सैनिटाइज़्ड संदर्भ पर निष्पादित हुआ।",
    completedNoMasks: "पूर्ण — इस चरण के लिए कोई संवेदनशील फ़ील्ड दायरे में नहीं था।",
    denied: "एक्शन रद्द किया गया — कुछ भी सबमिट नहीं हुआ।",
    stopped: "कार्य पूर्ण होने से पहले रोक दिया गया।",
    error: "इस कार्य पर विचार करते समय कुछ गड़बड़ी हुई।",
  },
  preview: {
    noRegions: "कोई संवेदनशील क्षेत्र नहीं मिला",
    footer:
      "पिक्सेल इस डिवाइस पर मेमोरी में ही मास्क किए जाते हैं। केवल टैग किए गए, रिडैक्टेड क्षेत्र ही रीज़निंग सर्वर को भेजे जाते हैं — कभी भी कच्चे मान नहीं।",
  },
  audit: {
    title: "गोपनीयता ऑडिट लॉग",
    subtitle: "इस सत्र में डिवाइस पर मास्क किया गया हर फ़ील्ड",
    close: "बंद करें",
    empty: "अभी तक कोई रिडैक्शन दर्ज नहीं हुआ। कार्य के दौरान V.A.R.M.A जैसे ही फ़ील्ड मास्क करता है, यह लॉग भरता जाता है।",
    maskedMessage: "{domain} पर 1 {tag} फ़ील्ड मास्क किया गया",
  },
  tags: {
    CREDENTIAL: "क्रेडेंशियल",
    COORDINATES: "भू-स्थानिक निर्देशांक",
    FACE: "चेहरा",
    ID_NUMBER: "आईडी नंबर",
    SIGNATURE: "हस्ताक्षर",
  },
  notice: {
    title: "आपका डेटा इसी डिवाइस पर रहता है",
    body:
      "V.A.R.M.A रीज़निंग सर्वर तक पहुँचने से पहले संवेदनशील फ़ील्ड को स्थानीय रूप से रिडैक्ट करता है। इस सत्र का बातचीत इतिहास और रिडैक्शन ऑडिट लॉग केवल इसी ब्राउज़र में संग्रहीत होते हैं — कभी कहीं नहीं भेजे जाते। इस पैनल को फिर से खोलने पर वह स्थानीय इतिहास रखने के लिए स्वीकार करें, या सब कुछ केवल मेमोरी में रखने के लिए अस्वीकार करें, जो बंद होते ही मिट जाएगा।",
    detailHeading: "केवल इसी ब्राउज़र में, केवल इस सत्र के लिए संग्रहीत",
    detailItem1: "बातचीत और कार्य इतिहास",
    detailItem2: "रिडैक्शन ऑडिट लॉग",
    detailItem3: "भाषा, ध्वनि और अनुमोदन-मोड प्राथमिकताएँ",
    customize: "अनुकूलित करें",
    reject: "अस्वीकार करें",
    accept: "स्वीकार करें",
  },
};

const gu: Translations = {
  header: {
    auditLog: "ગોપનીયતા ઓડિટ લોગ",
    newSession: "નવું સત્ર",
    menu: "વધુ",
    language: "ભાષા",
    mute: "અવાજ મ્યૂટ કરો",
    unmute: "અવાજ ચાલુ કરો",
    tabScope: "ટૅબ ઍક્સેસ સીમા",
    tabScopeSingle: "ફક્ત વર્તમાન ટૅબ",
    tabScopeAll: "બધા ટૅબ",
    visuals: "પૃષ્ઠ પર દૃશ્યો",
    visualsBoxes: "બાઉન્ડિંગ બોક્સ",
    visualsCursor: "એજન્ટ કર્સર",
    visualsRedact: "PII સ્વયં માસ્ક કરો",
    on: "ચાલુ",
    off: "બંધ",  },
  context: {
    noActiveTab: "કોઈ સક્રિય ટેબ નથી",
  },
  empty: {
    suggestion1: "ફોર્મ સારાંશ સાફ કરો અને કાઢો",
    suggestion2: "ભુવન પર આપત્તિ લેયર્સ પર જાઓ",
    suggestion3: "દેખાતા ટેલિમેટ્રી ફીલ્ડ તપાસો અને માસ્ક કરો",
  },
  input: {
    placeholder: "V.A.R.M.A ને આ પેજ પર કોઈ કાર્ય કરવા કહો…",
    autoRedact: "ઓટો-રિડેક્ટ",
    mic: "વૉઇસ ઇનપુટ",
    listening: "સાંભળી રહ્યું છે… રોકવા માટે ટેપ કરો",
    approvalMode: "મંજૂરી મોડ",
  },
  approvalMenu: {
    manual: "મેન્યુઅલી મંજૂર કરો",
    auto: "આપમેળે મંજૂર કરો",
    skip: "બધી મંજૂરીઓ છોડો",
  },
  card: {
    steps: "{n} પગલાં",
    statusRunning: "ચાલી રહ્યું છે…",
    statusAwaitingApproval: "તમારી મંજૂરીની રાહ જોવાઈ રહી છે",
    statusCompleted: "પૂર્ણ",
    statusDenied: "નકારેલ",
    statusStopped: "અટકાવ્યું",
    statusError: "ભૂલ",
  },
  steps: {
    capturingLabel: "વ્યૂપોર્ટ કેપ્ચર થઈ રહ્યું છે",
    capturingDetail: "{domain} ના દૃશ્યમાન વિસ્તારનો સ્નેપશોટ લેવાઈ રહ્યો છે",
    redactionLabel: "સ્થાનિક રિડેક્શન",
    redactionDetailMasked: "કેપ્ચર ડિવાઈસ છોડે તે પહેલાં {n} ફીલ્ડ માસ્ક કરાયા",
    redactionDetailNone: "વર્તમાન વ્યૂપોર્ટમાં કોઈ સંવેદનશીલ ફીલ્ડ મળ્યું નથી",
    reasoningLabel: "સર્વર રિઝનિંગ",
    reasoningDetail: "ફક્ત સેનિટાઈઝ્ડ સંદર્ભમાંથી એક્શન પેલોડ બનાવાઈ રહ્યો છે",
    actionLabel: "એક્શન",
    actionDetail: "પેજ પર સિન્થેટિક ઈન્ટરએક્શન એક્ઝિક્યુટ થઈ રહ્યું છે",
    showPreview: "સેનિટાઈઝ્ડ પ્રીવ્યૂ બતાવો",
    hidePreview: "સેનિટાઈઝ્ડ પ્રીવ્યૂ છુપાવો",
  },
  chips: {
    sanitizing: "DOM સેનિટાઈઝ થઈ રહ્યું છે",
    reasoning: "સર્વર રિઝનિંગ",
    executing: "એક્શન એક્ઝિક્યુટ થઈ રહ્યું છે",
    completed: "પૂર્ણ",
  },
  approval: {
    actionLabel: "{domain} પર ડેટા સબમિટ કરો",
    riskNote:
      "આ પગલું ડેસ્ટિનેશન સર્વર પર ડેટા લખે છે અને આપમેળે પાછું લઈ શકાતું નથી. આગળ વધતા પહેલાં સમીક્ષા કરો.",
    approve: "એક્શન મંજૂર કરો",
    deny: "નકારો",
    approvedNote: "મંજૂર — એક્શન એક્ઝિક્યુટ થયું.",
    deniedNote: "નકારેલ — કંઈ સબમિટ કરાયું નથી.",
    expiredNote: "નિર્ણય લેતા પહેલાં આ વિનંતીનો સમય પૂરો થઈ ગયો.",
    autoNote: "થોડી વારમાં સ્વયં મંજૂર — દરેક પગલું સમીક્ષા માટે મેન્યુઅલ પસંદ કરો.",
    autoApprovedNote: "સ્વયં મંજૂર — એક્શન એક્ઝિક્યુટ થયું.",
    stepLabel: "પગલું {n}",
    expiresIn: "{n}સેકંડમાં સમાપ્ત",
  },
  summary: {
    completedWithMasks:
      "પૂર્ણ — {n} ફીલ્ડ ડિવાઈસ પર જ રહ્યાં, એક્શન ફક્ત સેનિટાઈઝ્ડ સંદર્ભ પર એક્ઝિક્યુટ થયું.",
    completedNoMasks: "પૂર્ણ — આ પગલા માટે કોઈ સંવેદનશીલ ફીલ્ડ સ્કોપમાં નહોતું.",
    denied: "એક્શન રદ કરાયું — કંઈ સબમિટ કરાયું નથી.",
    stopped: "કાર્ય પૂર્ણ થાય તે પહેલાં અટકાવાયું.",
    error: "આ કાર્ય પર વિચાર કરતી વખતે કંઈક ખોટું થયું.",
  },
  preview: {
    noRegions: "કોઈ સંવેદનશીલ ક્ષેત્ર મળ્યું નથી",
    footer:
      "પિક્સેલ આ ડિવાઈસ પર મેમરીમાં જ માસ્ક કરાય છે. ફક્ત ટેગ કરેલા, રિડેક્ટેડ ક્ષેત્રો જ રિઝનિંગ સર્વરને મોકલાય છે — ક્યારેય રો વેલ્યુ નહીં.",
  },
  audit: {
    title: "ગોપનીયતા ઓડિટ લોગ",
    subtitle: "આ સત્રમાં ડિવાઈસ પર માસ્ક કરાયેલ દરેક ફીલ્ડ",
    close: "બંધ કરો",
    empty:
      "હજુ સુધી કોઈ રિડેક્શન નોંધાયું નથી. કાર્ય દરમિયાન V.A.R.M.A જેમ સંવેદનશીલ ફીલ્ડ માસ્ક કરે તેમ આ લોગ ભરાય છે.",
    maskedMessage: "{domain} પર 1 {tag} ફીલ્ડ માસ્ક કરાયું",
  },
  tags: {
    CREDENTIAL: "ક્રેડેન્શિયલ",
    COORDINATES: "જિયોસ્પેશિયલ કોઓર્ડિનેટ",
    FACE: "ચહેરો",
    ID_NUMBER: "ID નંબર",
    SIGNATURE: "સહી",
  },
  notice: {
    title: "તમારો ડેટા આ ડિવાઈસ પર જ રહે છે",
    body:
      "રિઝનિંગ સર્વર સુધી પહોંચતા પહેલા V.A.R.M.A સંવેદનશીલ ફીલ્ડને સ્થાનિક રીતે રિડેક્ટ કરે છે. આ સત્રનો વાતચીત ઇતિહાસ અને રિડેક્શન ઓડિટ લોગ ફક્ત આ બ્રાઉઝરમાં જ સંગ્રહિત થાય છે — ક્યારેય ક્યાંય મોકલાતા નથી. આ પેનલ ફરી ખોલવા પર તે સ્થાનિક ઇતિહાસ રાખવા સ્વીકારો, અથવા બધું ફક્ત મેમરીમાં રાખવા નકારો, જે બંધ થતાં જ ભૂંસાઈ જશે.",
    detailHeading: "ફક્ત આ બ્રાઉઝરમાં, ફક્ત આ સત્ર માટે સંગ્રહિત",
    detailItem1: "વાતચીત અને કાર્ય ઇતિહાસ",
    detailItem2: "રિડેક્શન ઓડિટ લોગ",
    detailItem3: "ભાષા, અવાજ અને મંજૂરી-મોડ પસંદગીઓ",
    customize: "કસ્ટમાઇઝ કરો",
    reject: "નકારો",
    accept: "સ્વીકારો",
  },
};

const mr: Translations = {
  header: {
    auditLog: "गोपनीयता ऑडिट लॉग",
    newSession: "नवीन सत्र",
    menu: "अधिक",
    language: "भाषा",
    mute: "आवाज म्यूट करा",
    unmute: "आवाज सुरू करा",
    tabScope: "टॅब प्रवेश मर्यादा",
    tabScopeSingle: "फक्त सध्याचा टॅब",
    tabScopeAll: "सर्व टॅब",
    visuals: "पृष्ठावरील दृश्ये",
    visualsBoxes: "बाउंडिंग बॉक्स",
    visualsCursor: "एजंट कर्सर",
    visualsRedact: "PII स्वयं-मास्क करा",
    on: "चालू",
    off: "बंद",  },
  context: {
    noActiveTab: "कोणतेही सक्रिय टॅब नाही",
  },
  empty: {
    suggestion1: "फॉर्म सारांश साफ करा आणि काढा",
    suggestion2: "भुवनवर आपत्ती लेयर्सवर जा",
    suggestion3: "दिसणारे टेलिमेट्री फील्ड तपासा आणि मास्क करा",
  },
  input: {
    placeholder: "V.A.R.M.A ला या पेजवर एखादे काम करण्यास सांगा…",
    autoRedact: "ऑटो-रिडॅक्ट",
    mic: "व्हॉइस इनपुट",
    listening: "ऐकत आहे… थांबवण्यासाठी टॅप करा",
    approvalMode: "मंजुरी मोड",
  },
  approvalMenu: {
    manual: "मॅन्युअली मंजूर करा",
    auto: "आपोआप मंजूर करा",
    skip: "सर्व मंजुरी वगळा",
  },
  card: {
    steps: "{n} पायऱ्या",
    statusRunning: "चालू आहे…",
    statusAwaitingApproval: "तुमच्या मंजुरीची वाट पाहत आहे",
    statusCompleted: "पूर्ण",
    statusDenied: "नाकारले",
    statusStopped: "थांबवले",
    statusError: "त्रुटी",
  },
  steps: {
    capturingLabel: "व्ह्यूपोर्ट कॅप्चर होत आहे",
    capturingDetail: "{domain} च्या दृश्य भागाचा स्नॅपशॉट घेतला जात आहे",
    redactionLabel: "स्थानिक रिडॅक्शन",
    redactionDetailMasked: "कॅप्चर डिव्हाइस सोडण्यापूर्वी {n} फील्ड मास्क केले",
    redactionDetailNone: "सध्याच्या व्ह्यूपोर्टमध्ये कोणतेही संवेदनशील फील्ड आढळले नाही",
    reasoningLabel: "सर्व्हर रिझनिंग",
    reasoningDetail: "फक्त सॅनिटाइझ्ड संदर्भावरून अ‍ॅक्शन पेलोड तयार होत आहे",
    actionLabel: "अ‍ॅक्शन",
    actionDetail: "पेजवर सिंथेटिक इंटरअ‍ॅक्शन एक्झिक्यूट होत आहे",
    showPreview: "सॅनिटाइझ्ड प्रीव्ह्यू दाखवा",
    hidePreview: "सॅनिटाइझ्ड प्रीव्ह्यू लपवा",
  },
  chips: {
    sanitizing: "DOM सॅनिटाइझ होत आहे",
    reasoning: "सर्व्हर रिझनिंग",
    executing: "अ‍ॅक्शन एक्झिक्यूट होत आहे",
    completed: "पूर्ण",
  },
  approval: {
    actionLabel: "{domain} वर डेटा सबमिट करा",
    riskNote:
      "हे पाऊल डेस्टिनेशन सर्व्हरवर डेटा लिहिते आणि आपोआप पूर्ववत करता येत नाही. पुढे जाण्यापूर्वी पुनरावलोकन करा.",
    approve: "अ‍ॅक्शन मंजूर करा",
    deny: "नाकारा",
    approvedNote: "मंजूर — अ‍ॅक्शन एक्झिक्यूट झाले.",
    deniedNote: "नाकारले — काहीही सबमिट केले गेले नाही.",
    expiredNote: "निर्णय घेण्यापूर्वी या विनंतीची वेळ संपली.",
    autoNote: "काही क्षणात स्वयं-मंजूर — प्रत्येक पायरी तपासण्यासाठी मॅन्युअल निवडा.",
    autoApprovedNote: "स्वयं-मंजूर — अ‍ॅक्शन एक्झिक्यूट झाले.",
    stepLabel: "पायरी {n}",
    expiresIn: "{n}सेकंदात संपेल",
  },
  summary: {
    completedWithMasks:
      "पूर्ण — {n} फील्ड डिव्हाइसवरच राहिले, अ‍ॅक्शन फक्त सॅनिटाइझ्ड संदर्भावर एक्झिक्यूट झाले.",
    completedNoMasks: "पूर्ण — या पायरीसाठी कोणतेही संवेदनशील फील्ड कक्षेत नव्हते.",
    denied: "अ‍ॅक्शन रद्द केले — काहीही सबमिट केले गेले नाही.",
    stopped: "काम पूर्ण होण्यापूर्वी थांबवले.",
    error: "या कामाबद्दल विचार करताना काहीतरी चुकले.",
  },
  preview: {
    noRegions: "कोणताही संवेदनशील भाग आढळला नाही",
    footer:
      "पिक्सेल्स या डिव्हाइसवर मेमरीमध्येच मास्क केले जातात. फक्त टॅग केलेले, रिडॅक्ट केलेले भागच रिझनिंग सर्व्हरला पाठवले जातात — कधीही मूळ मूल्ये नाहीत.",
  },
  audit: {
    title: "गोपनीयता ऑडिट लॉग",
    subtitle: "या सत्रात डिव्हाइसवर मास्क केलेले प्रत्येक फील्ड",
    close: "बंद करा",
    empty:
      "अजून कोणतेही रिडॅक्शन नोंदवले गेलेले नाही. काम सुरू असताना V.A.R.M.A जसे संवेदनशील फील्ड मास्क करते तसे हे लॉग भरत जाते.",
    maskedMessage: "{domain} वर 1 {tag} फील्ड मास्क केले",
  },
  tags: {
    CREDENTIAL: "क्रेडेन्शियल",
    COORDINATES: "भू-स्थानिक निर्देशांक",
    FACE: "चेहरा",
    ID_NUMBER: "ID क्रमांक",
    SIGNATURE: "स्वाक्षरी",
  },
  notice: {
    title: "तुमचा डेटा याच डिव्हाइसवर राहतो",
    body:
      "रिझनिंग सर्व्हरपर्यंत पोहोचण्यापूर्वी V.A.R.M.A संवेदनशील फील्ड स्थानिक पातळीवर रिडॅक्ट करते. या सत्राचा संभाषण इतिहास आणि रिडॅक्शन ऑडिट लॉग फक्त या ब्राउझरमध्येच साठवले जातात — कधीही कुठेही पाठवले जात नाहीत. हे पॅनेल पुन्हा उघडताना तो स्थानिक इतिहास ठेवण्यासाठी स्वीकारा, किंवा सर्वकाही फक्त मेमरीमध्ये ठेवण्यासाठी नाकारा, जे बंद होताच पुसले जाईल.",
    detailHeading: "फक्त या ब्राउझरमध्ये, फक्त या सत्रासाठी साठवलेले",
    detailItem1: "संभाषण आणि कार्य इतिहास",
    detailItem2: "रिडॅक्शन ऑडिट लॉग",
    detailItem3: "भाषा, आवाज आणि मंजुरी-मोड प्राधान्ये",
    customize: "सानुकूलित करा",
    reject: "नाकारा",
    accept: "स्वीकारा",
  },
};

const kn: Translations = {
  header: {
    auditLog: "ಗೌಪ್ಯತೆ ಆಡಿಟ್ ಲಾಗ್",
    newSession: "ಹೊಸ ಸೆಶನ್",
    menu: "ಇನ್ನಷ್ಟು",
    language: "ಭಾಷೆ",
    mute: "ಧ್ವನಿ ಮ್ಯೂಟ್ ಮಾಡಿ",
    unmute: "ಧ್ವನಿ ಆನ್ ಮಾಡಿ",
    tabScope: "ಟ್ಯಾಬ್ ಪ್ರವೇಶ ವ್ಯಾಪ್ತಿ",
    tabScopeSingle: "ಪ್ರಸ್ತುತ ಟ್ಯಾಬ್ ಮಾತ್ರ",
    tabScopeAll: "ಎಲ್ಲಾ ಟ್ಯಾಬ್‌ಗಳು",
    visuals: "ಪುಟದ ದೃಶ್ಯಗಳು",
    visualsBoxes: "ಬೌಂಡಿಂಗ್ ಬಾಕ್ಸ್",
    visualsCursor: "ಏಜೆಂಟ್ ಕರ್ಸರ್",
    visualsRedact: "PII ಸ್ವಯಂ-ಮಾಸ್ಕ್ ಮಾಡಿ",
    on: "ಆನ್",
    off: "ಆಫ್",  },
  context: {
    noActiveTab: "ಯಾವುದೇ ಸಕ್ರಿಯ ಟ್ಯಾಬ್ ಇಲ್ಲ",
  },
  empty: {
    suggestion1: "ಫಾರ್ಮ್ ಸಾರಾಂಶವನ್ನು ಸ್ವಚ್ಛಗೊಳಿಸಿ ಮತ್ತು ಹೊರತೆಗೆಯಿರಿ",
    suggestion2: "ಭುವನ್‌ನಲ್ಲಿ ವಿಪತ್ತು ಲೇಯರ್‌ಗಳಿಗೆ ಹೋಗಿ",
    suggestion3: "ಗೋಚರಿಸುವ ಟೆಲಿಮೆಟ್ರಿ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮಾಸ್ಕ್ ಮಾಡಿ",
  },
  input: {
    placeholder: "ಈ ಪುಟದಲ್ಲಿ ಒಂದು ಕಾರ್ಯವನ್ನು ನಿರ್ವಹಿಸಲು V.A.R.M.A ಅನ್ನು ಕೇಳಿ…",
    autoRedact: "ಆಟೋ-ರಿಡ್ಯಾಕ್ಟ್",
    mic: "ಧ್ವನಿ ಇನ್‌ಪುಟ್",
    listening: "ಆಲಿಸುತ್ತಿದೆ… ನಿಲ್ಲಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ",
    approvalMode: "ಅನುಮೋದನೆ ಮೋಡ್",
  },
  approvalMenu: {
    manual: "ಹಸ್ತಚಾಲಿತವಾಗಿ ಅನುಮೋದಿಸಿ",
    auto: "ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಅನುಮೋದಿಸಿ",
    skip: "ಎಲ್ಲಾ ಅನುಮೋದನೆಗಳನ್ನು ಬಿಟ್ಟುಬಿಡಿ",
  },
  card: {
    steps: "{n} ಹಂತಗಳು",
    statusRunning: "ಚಾಲನೆಯಲ್ಲಿದೆ…",
    statusAwaitingApproval: "ನಿಮ್ಮ ಅನುಮೋದನೆಗಾಗಿ ಕಾಯುತ್ತಿದೆ",
    statusCompleted: "ಪೂರ್ಣಗೊಂಡಿದೆ",
    statusDenied: "ನಿರಾಕರಿಸಲಾಗಿದೆ",
    statusStopped: "ನಿಲ್ಲಿಸಲಾಗಿದೆ",
    statusError: "ದೋಷ",
  },
  steps: {
    capturingLabel: "ವ್ಯೂಪೋರ್ಟ್ ಸೆರೆಹಿಡಿಯಲಾಗುತ್ತಿದೆ",
    capturingDetail: "{domain} ನ ಗೋಚರ ಪ್ರದೇಶದ ಸ್ನ್ಯಾಪ್‌ಶಾಟ್ ತೆಗೆಯಲಾಗುತ್ತಿದೆ",
    redactionLabel: "ಸ್ಥಳೀಯ ರಿಡ್ಯಾಕ್ಷನ್",
    redactionDetailMasked: "ಸೆರೆಹಿಡಿಯುವಿಕೆ ಸಾಧನವನ್ನು ಬಿಡುವ ಮೊದಲು {n} ಫೀಲ್ಡ್‌ಗಳನ್ನು ಮಾಸ್ಕ್ ಮಾಡಲಾಗಿದೆ",
    redactionDetailNone: "ಪ್ರಸ್ತುತ ವ್ಯೂಪೋರ್ಟ್‌ನಲ್ಲಿ ಯಾವುದೇ ಸೂಕ್ಷ್ಮ ಫೀಲ್ಡ್‌ಗಳು ಕಂಡುಬಂದಿಲ್ಲ",
    reasoningLabel: "ಸರ್ವರ್ ರೀಸನಿಂಗ್",
    reasoningDetail: "ಸ್ಯಾನಿಟೈಸ್ ಮಾಡಿದ ಸಂದರ್ಭದಿಂದ ಮಾತ್ರ ಆಕ್ಷನ್ ಪೇಲೋಡ್ ಅನ್ನು ರಚಿಸಲಾಗುತ್ತಿದೆ",
    actionLabel: "ಆಕ್ಷನ್",
    actionDetail: "ಪುಟದಲ್ಲಿ ಸಿಂಥೆಟಿಕ್ ಇಂಟರಾಕ್ಷನ್ ಅನ್ನು ಕಾರ್ಯಗತಗೊಳಿಸಲಾಗುತ್ತಿದೆ",
    showPreview: "ಸ್ಯಾನಿಟೈಸ್ ಮಾಡಿದ ಪ್ರಿವ್ಯೂ ತೋರಿಸಿ",
    hidePreview: "ಸ್ಯಾನಿಟೈಸ್ ಮಾಡಿದ ಪ್ರಿವ್ಯೂ ಮರೆಮಾಡಿ",
  },
  chips: {
    sanitizing: "DOM ಸ್ಯಾನಿಟೈಸ್ ಆಗುತ್ತಿದೆ",
    reasoning: "ಸರ್ವರ್ ರೀಸನಿಂಗ್",
    executing: "ಆಕ್ಷನ್ ಕಾರ್ಯಗತಗೊಳ್ಳುತ್ತಿದೆ",
    completed: "ಪೂರ್ಣಗೊಂಡಿದೆ",
  },
  approval: {
    actionLabel: "{domain} ಗೆ ಡೇಟಾ ಸಲ್ಲಿಸಿ",
    riskNote:
      "ಈ ಹಂತವು ಗಮ್ಯಸ್ಥಾನ ಸರ್ವರ್‌ಗೆ ಡೇಟಾವನ್ನು ಬರೆಯುತ್ತದೆ ಮತ್ತು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ರದ್ದುಗೊಳಿಸಲಾಗುವುದಿಲ್ಲ. ಮುಂದುವರಿಯುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ.",
    approve: "ಆಕ್ಷನ್ ಅನುಮೋದಿಸಿ",
    deny: "ನಿರಾಕರಿಸಿ",
    approvedNote: "ಅನುಮೋದಿಸಲಾಗಿದೆ — ಆಕ್ಷನ್ ಕಾರ್ಯಗತಗೊಂಡಿದೆ.",
    deniedNote: "ನಿರಾಕರಿಸಲಾಗಿದೆ — ಏನನ್ನೂ ಸಲ್ಲಿಸಲಾಗಿಲ್ಲ.",
    expiredNote: "ನಿರ್ಧಾರ ತೆಗೆದುಕೊಳ್ಳುವ ಮೊದಲು ಈ ವಿನಂತಿಯ ಸಮಯ ಮುಗಿಯಿತು.",
    autoNote: "ಸ್ವಲ್ಪ ಸಮಯದಲ್ಲಿ ಸ್ವಯಂ-ಅನುಮೋದನೆ — ಪ್ರತಿ ಹಂತವನ್ನೂ ಪರಿಶೀಲಿಸಲು ಮ್ಯಾನ್ಯುಯಲ್ ಆಯ್ಕೆಮಾಡಿ.",
    autoApprovedNote: "ಸ್ವಯಂ-ಅನುಮೋದಿಸಲಾಗಿದೆ — ಆಕ್ಷನ್ ಕಾರ್ಯಗತಗೊಂಡಿದೆ.",
    stepLabel: "ಹಂತ {n}",
    expiresIn: "{n}ಸೆಕೆಂಡ್‌ಗಳಲ್ಲಿ ಮುಗಿಯುತ್ತದೆ",
  },
  summary: {
    completedWithMasks:
      "ಪೂರ್ಣಗೊಂಡಿದೆ — {n} ಫೀಲ್ಡ್‌ಗಳು ಸಾಧನದಲ್ಲೇ ಉಳಿದಿವೆ, ಆಕ್ಷನ್ ಸ್ಯಾನಿಟೈಸ್ ಮಾಡಿದ ಸಂದರ್ಭದ ಮೇಲೆ ಮಾತ್ರ ಕಾರ್ಯಗತಗೊಂಡಿದೆ.",
    completedNoMasks: "ಪೂರ್ಣಗೊಂಡಿದೆ — ಈ ಹಂತಕ್ಕೆ ಯಾವುದೇ ಸೂಕ್ಷ್ಮ ಫೀಲ್ಡ್‌ಗಳು ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಇರಲಿಲ್ಲ.",
    denied: "ಆಕ್ಷನ್ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ — ಏನನ್ನೂ ಸಲ್ಲಿಸಲಾಗಿಲ್ಲ.",
    stopped: "ಕಾರ್ಯ ಪೂರ್ಣಗೊಳ್ಳುವ ಮೊದಲು ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
    error: "ಈ ಕಾರ್ಯದ ಬಗ್ಗೆ ಆಲೋಚಿಸುವಾಗ ಏನೋ ತಪ್ಪಾಗಿದೆ.",
  },
  preview: {
    noRegions: "ಯಾವುದೇ ಸೂಕ್ಷ್ಮ ಪ್ರದೇಶಗಳು ಕಂಡುಬಂದಿಲ್ಲ",
    footer:
      "ಪಿಕ್ಸೆಲ್‌ಗಳನ್ನು ಈ ಸಾಧನದಲ್ಲಿ ಮೆಮೊರಿಯಲ್ಲೇ ಮಾಸ್ಕ್ ಮಾಡಲಾಗುತ್ತದೆ. ಟ್ಯಾಗ್ ಮಾಡಿದ, ರಿಡ್ಯಾಕ್ಟ್ ಮಾಡಿದ ಪ್ರದೇಶಗಳನ್ನು ಮಾತ್ರ ರೀಸನಿಂಗ್ ಸರ್ವರ್‌ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ — ಎಂದಿಗೂ ಮೂಲ ಮೌಲ್ಯಗಳಲ್ಲ.",
  },
  audit: {
    title: "ಗೌಪ್ಯತೆ ಆಡಿಟ್ ಲಾಗ್",
    subtitle: "ಈ ಸೆಶನ್‌ನಲ್ಲಿ ಸಾಧನದಲ್ಲಿ ಮಾಸ್ಕ್ ಮಾಡಲಾದ ಪ್ರತಿಯೊಂದು ಫೀಲ್ಡ್",
    close: "ಮುಚ್ಚಿ",
    empty:
      "ಇನ್ನೂ ಯಾವುದೇ ರಿಡ್ಯಾಕ್ಷನ್ ದಾಖಲಾಗಿಲ್ಲ. ಕಾರ್ಯದ ಸಮಯದಲ್ಲಿ V.A.R.M.A ಸೂಕ್ಷ್ಮ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಮಾಸ್ಕ್ ಮಾಡಿದಂತೆ ಈ ಲಾಗ್ ತುಂಬುತ್ತದೆ.",
    maskedMessage: "{domain} ನಲ್ಲಿ 1 {tag} ಫೀಲ್ಡ್ ಮಾಸ್ಕ್ ಮಾಡಲಾಗಿದೆ",
  },
  tags: {
    CREDENTIAL: "ಕ್ರೆಡೆನ್ಷಿಯಲ್",
    COORDINATES: "ಭೌಗೋಳಿಕ ನಿರ್ದೇಶಾಂಕ",
    FACE: "ಮುಖ",
    ID_NUMBER: "ID ಸಂಖ್ಯೆ",
    SIGNATURE: "ಸಹಿ",
  },
  notice: {
    title: "ನಿಮ್ಮ ಡೇಟಾ ಈ ಸಾಧನದಲ್ಲಿಯೇ ಇರುತ್ತದೆ",
    body:
      "ರೀಸನಿಂಗ್ ಸರ್ವರ್‌ಗೆ ತಲುಪುವ ಮೊದಲು V.A.R.M.A ಸೂಕ್ಷ್ಮ ಫೀಲ್ಡ್‌ಗಳನ್ನು ಸ್ಥಳೀಯವಾಗಿ ರಿಡ್ಯಾಕ್ಟ್ ಮಾಡುತ್ತದೆ. ಈ ಸೆಶನ್‌ನ ಸಂಭಾಷಣೆ ಇತಿಹಾಸ ಮತ್ತು ರಿಡ್ಯಾಕ್ಷನ್ ಆಡಿಟ್ ಲಾಗ್ ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮಾತ್ರ ಸಂಗ್ರಹವಾಗುತ್ತದೆ — ಎಂದಿಗೂ ಎಲ್ಲಿಯೂ ಕಳುಹಿಸಲಾಗುವುದಿಲ್ಲ. ಈ ಪ್ಯಾನಲ್ ಅನ್ನು ಮತ್ತೆ ತೆರೆದಾಗ ಆ ಸ್ಥಳೀಯ ಇತಿಹಾಸವನ್ನು ಇರಿಸಿಕೊಳ್ಳಲು ಒಪ್ಪಿಕೊಳ್ಳಿ, ಅಥವಾ ಎಲ್ಲವನ್ನೂ ಮೆಮೊರಿಯಲ್ಲಿ ಮಾತ್ರ ಇರಿಸಲು ನಿರಾಕರಿಸಿ, ಅದು ಮುಚ್ಚಿದ ತಕ್ಷಣ ಅಳಿಸಿಹೋಗುತ್ತದೆ.",
    detailHeading: "ಈ ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮಾತ್ರ, ಈ ಸೆಶನ್‌ಗೆ ಮಾತ್ರ ಸಂಗ್ರಹಿಸಲಾಗಿದೆ",
    detailItem1: "ಸಂಭಾಷಣೆ ಮತ್ತು ಕಾರ್ಯ ಇತಿಹಾಸ",
    detailItem2: "ರಿಡ್ಯಾಕ್ಷನ್ ಆಡಿಟ್ ಲಾಗ್",
    detailItem3: "ಭಾಷೆ, ಧ್ವನಿ ಮತ್ತು ಅನುಮೋದನೆ-ಮೋಡ್ ಆದ್ಯತೆಗಳು",
    customize: "ಕಸ್ಟಮೈಸ್ ಮಾಡಿ",
    reject: "ನಿರಾಕರಿಸಿ",
    accept: "ಒಪ್ಪಿಕೊಳ್ಳಿ",
  },
};

const ml: Translations = {
  header: {
    auditLog: "സ്വകാര്യതാ ഓഡിറ്റ് ലോഗ്",
    newSession: "പുതിയ സെഷൻ",
    menu: "കൂടുതൽ",
    language: "ഭാഷ",
    mute: "ശബ്ദം മ്യൂട്ട് ചെയ്യുക",
    unmute: "ശബ്ദം ഓണാക്കുക",
    tabScope: "ടാബ് ആക്സസ് പരിധി",
    tabScopeSingle: "നിലവിലെ ടാബ് മാത്രം",
    tabScopeAll: "എല്ലാ ടാബുകളും",
    visuals: "പേജിലെ ദൃശ്യങ്ങൾ",
    visualsBoxes: "ബൗണ്ടിംഗ് ബോക്സുകൾ",
    visualsCursor: "ഏജന്റ് കഴ്സർ",
    visualsRedact: "PII സ്വയം മാസ്ക് ചെയ്യുക",
    on: "ഓൺ",
    off: "ഓഫ്",  },
  context: {
    noActiveTab: "സജീവ ടാബ് ഇല്ല",
  },
  empty: {
    suggestion1: "ഫോം സംഗ്രഹം ശുദ്ധീകരിച്ച് എടുക്കുക",
    suggestion2: "ഭുവനിലെ ദുരന്ത ലെയറുകളിലേക്ക് പോകുക",
    suggestion3: "ദൃശ്യമായ ടെലിമെട്രി ഫീൽഡുകൾ പരിശോധിച്ച് മാസ്ക് ചെയ്യുക",
  },
  input: {
    placeholder: "ഈ പേജിൽ ഒരു ടാസ്ക് ചെയ്യാൻ V.A.R.M.A യോട് ആവശ്യപ്പെടുക…",
    autoRedact: "ഓട്ടോ-റിഡാക്റ്റ്",
    mic: "വോയ്‌സ് ഇൻപുട്ട്",
    listening: "കേൾക്കുന്നു… നിർത്താൻ ടാപ്പ് ചെയ്യുക",
    approvalMode: "അനുമതി മോഡ്",
  },
  approvalMenu: {
    manual: "സ്വമേധയാ അംഗീകരിക്കുക",
    auto: "സ്വയമേവ അംഗീകരിക്കുക",
    skip: "എല്ലാ അനുമതികളും ഒഴിവാക്കുക",
  },
  card: {
    steps: "{n} ഘട്ടങ്ങൾ",
    statusRunning: "പ്രവർത്തിക്കുന്നു…",
    statusAwaitingApproval: "നിങ്ങളുടെ അനുമതിക്കായി കാത്തിരിക്കുന്നു",
    statusCompleted: "പൂർത്തിയായി",
    statusDenied: "നിരസിച്ചു",
    statusStopped: "നിർത്തി",
    statusError: "പിശക്",
  },
  steps: {
    capturingLabel: "വ്യൂപോർട്ട് ക്യാപ്ചർ ചെയ്യുന്നു",
    capturingDetail: "{domain} ന്റെ ദൃശ്യമായ ഭാഗത്തിന്റെ സ്നാപ്‌ഷോട്ട് എടുക്കുന്നു",
    redactionLabel: "ലോക്കൽ റിഡാക്ഷൻ",
    redactionDetailMasked: "ക്യാപ്ചർ ഉപകരണം വിടുന്നതിന് മുമ്പ് {n} ഫീൽഡുകൾ മാസ്ക് ചെയ്തു",
    redactionDetailNone: "നിലവിലെ വ്യൂപോർട്ടിൽ സെൻസിറ്റീവ് ഫീൽഡുകളൊന്നും കണ്ടെത്തിയില്ല",
    reasoningLabel: "സെർവർ റീസണിംഗ്",
    reasoningDetail: "ശുദ്ധീകരിച്ച സന്ദർഭത്തിൽ നിന്ന് മാത്രം ആക്ഷൻ പേലോഡ് സൃഷ്ടിക്കുന്നു",
    actionLabel: "ആക്ഷൻ",
    actionDetail: "പേജിൽ സിന്തറ്റിക് ഇന്ററാക്ഷൻ നടപ്പിലാക്കുന്നു",
    showPreview: "ശുദ്ധീകരിച്ച പ്രിവ്യൂ കാണിക്കുക",
    hidePreview: "ശുദ്ധീകരിച്ച പ്രിവ്യൂ മറയ്ക്കുക",
  },
  chips: {
    sanitizing: "DOM ശുദ്ധീകരിക്കുന്നു",
    reasoning: "സെർവർ റീസണിംഗ്",
    executing: "ആക്ഷൻ നടപ്പിലാക്കുന്നു",
    completed: "പൂർത്തിയായി",
  },
  approval: {
    actionLabel: "{domain} ലേക്ക് ഡാറ്റ സമർപ്പിക്കുക",
    riskNote:
      "ഈ ഘട്ടം ലക്ഷ്യസ്ഥാന സെർവറിലേക്ക് ഡാറ്റ എഴുതുന്നു, സ്വയമേവ പഴയപടിയാക്കാൻ കഴിയില്ല. തുടരുന്നതിന് മുമ്പ് അവലോകനം ചെയ്യുക.",
    approve: "ആക്ഷൻ അംഗീകരിക്കുക",
    deny: "നിരസിക്കുക",
    approvedNote: "അംഗീകരിച്ചു — ആക്ഷൻ നടപ്പിലാക്കി.",
    deniedNote: "നിരസിച്ചു — ഒന്നും സമർപ്പിച്ചിട്ടില്ല.",
    expiredNote: "തീരുമാനം എടുക്കുന്നതിന് മുമ്പ് ഈ അഭ്യർത്ഥനയുടെ സമയം കഴിഞ്ഞു.",
    autoNote: "അൽപ്പസമയത്തിനുള്ളിൽ സ്വയം അംഗീകരിക്കും — ഓരോ ഘട്ടവും പരിശോധിക്കാൻ മാനുവൽ തിരഞ്ഞെടുക്കുക.",
    autoApprovedNote: "സ്വയം അംഗീകരിച്ചു — ആക്ഷൻ നടപ്പിലാക്കി.",
    stepLabel: "ഘട്ടം {n}",
    expiresIn: "{n}സെക്കൻഡിൽ അവസാനിക്കും",
  },
  summary: {
    completedWithMasks:
      "പൂർത്തിയായി — {n} ഫീൽഡുകൾ ഉപകരണത്തിൽ തന്നെ തുടർന്നു, ശുദ്ധീകരിച്ച സന്ദർഭത്തിൽ മാത്രം ആക്ഷൻ നടപ്പിലാക്കി.",
    completedNoMasks: "പൂർത്തിയായി — ഈ ഘട്ടത്തിന് സെൻസിറ്റീവ് ഫീൽഡുകളൊന്നും പരിധിയിൽ ഇല്ലായിരുന്നു.",
    denied: "ആക്ഷൻ റദ്ദാക്കി — ഒന്നും സമർപ്പിച്ചിട്ടില്ല.",
    stopped: "ടാസ്ക് പൂർത്തിയാകുന്നതിന് മുമ്പ് നിർത്തി.",
    error: "ഈ ടാസ്കിനെക്കുറിച്ച് ചിന്തിക്കുമ്പോൾ എന്തോ കുഴപ്പം സംഭവിച്ചു.",
  },
  preview: {
    noRegions: "സെൻസിറ്റീവ് മേഖലകളൊന്നും കണ്ടെത്തിയില്ല",
    footer:
      "പിക്സലുകൾ ഈ ഉപകരണത്തിൽ മെമ്മറിയിൽ തന്നെ മാസ്ക് ചെയ്യുന്നു. ടാഗ് ചെയ്ത, റിഡാക്റ്റ് ചെയ്ത മേഖലകൾ മാത്രമേ റീസണിംഗ് സെർവറിലേക്ക് അയക്കൂ — ഒരിക്കലും യഥാർത്ഥ മൂല്യങ്ങളല്ല.",
  },
  audit: {
    title: "സ്വകാര്യതാ ഓഡിറ്റ് ലോഗ്",
    subtitle: "ഈ സെഷനിൽ ഉപകരണത്തിൽ മാസ്ക് ചെയ്ത ഓരോ ഫീൽഡും",
    close: "അടയ്ക്കുക",
    empty:
      "ഇതുവരെ റിഡാക്ഷനുകളൊന്നും രേഖപ്പെടുത്തിയിട്ടില്ല. ടാസ്കിനിടെ V.A.R.M.A സെൻസിറ്റീവ് ഫീൽഡുകൾ മാസ്ക് ചെയ്യുന്നതനുസരിച്ച് ഈ ലോഗ് നിറയും.",
    maskedMessage: "{domain} ൽ 1 {tag} ഫീൽഡ് മാസ്ക് ചെയ്തു",
  },
  tags: {
    CREDENTIAL: "ക്രെഡൻഷ്യൽ",
    COORDINATES: "ജിയോസ്പേഷ്യൽ കോർഡിനേറ്റ്",
    FACE: "മുഖം",
    ID_NUMBER: "ID നമ്പർ",
    SIGNATURE: "ഒപ്പ്",
  },
  notice: {
    title: "നിങ്ങളുടെ ഡാറ്റ ഈ ഉപകരണത്തിൽ തന്നെ നിലനിൽക്കുന്നു",
    body:
      "റീസണിംഗ് സെർവറിൽ എത്തുന്നതിന് മുമ്പ് V.A.R.M.A സെൻസിറ്റീവ് ഫീൽഡുകൾ പ്രാദേശികമായി റിഡാക്റ്റ് ചെയ്യുന്നു. ഈ സെഷന്റെ സംഭാഷണ ചരിത്രവും റിഡാക്ഷൻ ഓഡിറ്റ് ലോഗും ഈ ബ്രൗസറിൽ മാത്രം സൂക്ഷിക്കുന്നു — ഒരിക്കലും എവിടേക്കും അയക്കുന്നില്ല. ഈ പാനൽ വീണ്ടും തുറക്കുമ്പോൾ ആ പ്രാദേശിക ചരിത്രം സൂക്ഷിക്കാൻ അംഗീകരിക്കുക, അല്ലെങ്കിൽ എല്ലാം മെമ്മറിയിൽ മാത്രം സൂക്ഷിക്കാൻ നിരസിക്കുക, അത് അടയുന്ന ഉടൻ മായ്ക്കപ്പെടും.",
    detailHeading: "ഈ ബ്രൗസറിൽ മാത്രം, ഈ സെഷനിൽ മാത്രം സൂക്ഷിച്ചത്",
    detailItem1: "സംഭാഷണവും ടാസ്ക് ചരിത്രവും",
    detailItem2: "റിഡാക്ഷൻ ഓഡിറ്റ് ലോഗ്",
    detailItem3: "ഭാഷ, ശബ്ദം, അനുമതി-മോഡ് മുൻഗണനകൾ",
    customize: "ഇഷ്ടാനുസൃതമാക്കുക",
    reject: "നിരസിക്കുക",
    accept: "അംഗീകരിക്കുക",
  },
};

const ta: Translations = {
  header: {
    auditLog: "தனியுரிமை தணிக்கை பதிவு",
    newSession: "புதிய அமர்வு",
    menu: "மேலும்",
    language: "மொழி",
    mute: "ஒலியை நிறுத்து",
    unmute: "ஒலியை இயக்கு",
    tabScope: "தாவல் அணுகல் வரம்பு",
    tabScopeSingle: "தற்போதைய தாவல் மட்டும்",
    tabScopeAll: "எல்லா தாவல்களும்",
    visuals: "பக்க காட்சிகள்",
    visualsBoxes: "எல்லைப் பெட்டிகள்",
    visualsCursor: "முகவர் கர்சர்",
    visualsRedact: "PII தானாக மறை",
    on: "இயக்கம்",
    off: "நிறுத்தம்",  },
  context: {
    noActiveTab: "செயலில் உள்ள தாவல் இல்லை",
  },
  empty: {
    suggestion1: "படிவச் சுருக்கத்தை சுத்தம் செய்து பிரித்தெடுக்கவும்",
    suggestion2: "பூவனில் பேரிடர் லேயர்களுக்குச் செல்லவும்",
    suggestion3: "தெரியும் டெலிமெட்ரி புலங்களை ஆய்வு செய்து மறைக்கவும்",
  },
  input: {
    placeholder: "இந்தப் பக்கத்தில் ஒரு பணியைச் செய்ய V.A.R.M.A-விடம் கேளுங்கள்…",
    autoRedact: "தானியங்கி-மறைப்பு",
    mic: "குரல் உள்ளீடு",
    listening: "கேட்கிறது… நிறுத்த தட்டவும்",
    approvalMode: "ஒப்புதல் பயன்முறை",
  },
  approvalMenu: {
    manual: "கைமுறையாக அங்கீகரிக்கவும்",
    auto: "தானாக அங்கீகரிக்கவும்",
    skip: "எல்லா ஒப்புதல்களையும் தவிர்க்கவும்",
  },
  card: {
    steps: "{n} படிகள்",
    statusRunning: "இயங்குகிறது…",
    statusAwaitingApproval: "உங்கள் ஒப்புதலுக்காக காத்திருக்கிறது",
    statusCompleted: "முடிந்தது",
    statusDenied: "மறுக்கப்பட்டது",
    statusStopped: "நிறுத்தப்பட்டது",
    statusError: "பிழை",
  },
  steps: {
    capturingLabel: "வியூபோர்ட் படமெடுக்கப்படுகிறது",
    capturingDetail: "{domain} இன் தெரியும் பகுதியின் ஸ்னாப்ஷாட் எடுக்கப்படுகிறது",
    redactionLabel: "உள்ளூர் மறைப்பு",
    redactionDetailMasked: "படம் சாதனத்தை விட்டு வெளியேறும் முன் {n} புலங்கள் மறைக்கப்பட்டன",
    redactionDetailNone: "தற்போதைய வியூபோர்ட்டில் முக்கியமான புலங்கள் எதுவும் கண்டறியப்படவில்லை",
    reasoningLabel: "சர்வர் தர்க்கம்",
    reasoningDetail: "சுத்தம் செய்யப்பட்ட சூழலில் இருந்து மட்டும் செயல் பேலோட் உருவாக்கப்படுகிறது",
    actionLabel: "செயல்",
    actionDetail: "பக்கத்தில் செயற்கை தொடர்பு செயல்படுத்தப்படுகிறது",
    showPreview: "சுத்தம் செய்யப்பட்ட முன்னோட்டத்தைக் காட்டு",
    hidePreview: "சுத்தம் செய்யப்பட்ட முன்னோட்டத்தை மறை",
  },
  chips: {
    sanitizing: "DOM சுத்தம் செய்யப்படுகிறது",
    reasoning: "சர்வர் தர்க்கம்",
    executing: "செயல் செயல்படுத்தப்படுகிறது",
    completed: "முடிந்தது",
  },
  approval: {
    actionLabel: "{domain} க்கு தரவை சமர்ப்பிக்கவும்",
    riskNote:
      "இந்தப் படி இலக்கு சர்வரில் தரவை எழுதுகிறது, தானாக செயல்தவிர்க்க முடியாது. தொடர்வதற்கு முன் மதிப்பாய்வு செய்யவும்.",
    approve: "செயலை அங்கீகரி",
    deny: "மறு",
    approvedNote: "அங்கீகரிக்கப்பட்டது — செயல் செயல்படுத்தப்பட்டது.",
    deniedNote: "மறுக்கப்பட்டது — எதுவும் சமர்ப்பிக்கப்படவில்லை.",
    expiredNote: "முடிவெடுப்பதற்கு முன்பே இந்தக் கோரிக்கையின் நேரம் முடிந்தது.",
    autoNote: "சிறிது நேரத்தில் தானாக அங்கீகரிக்கப்படும் — ஒவ்வொரு படியையும் சரிபார்க்க கைமுறையைத் தேர்ந்தெடுக்கவும்.",
    autoApprovedNote: "தானாக அங்கீகரிக்கப்பட்டது — செயல் செயல்படுத்தப்பட்டது.",
    stepLabel: "படி {n}",
    expiresIn: "{n}விநாடிகளில் முடிவடையும்",
  },
  summary: {
    completedWithMasks:
      "முடிந்தது — {n} புலங்கள் சாதனத்திலேயே இருந்தன, சுத்தம் செய்யப்பட்ட சூழலில் மட்டும் செயல் செயல்படுத்தப்பட்டது.",
    completedNoMasks: "முடிந்தது — இந்தப் படிக்கு முக்கியமான புலங்கள் எதுவும் வரம்பில் இல்லை.",
    denied: "செயல் ரத்து செய்யப்பட்டது — எதுவும் சமர்ப்பிக்கப்படவில்லை.",
    stopped: "பணி முடிவதற்கு முன் நிறுத்தப்பட்டது.",
    error: "இந்தப் பணியைப் பற்றி சிந்திக்கும்போது ஏதோ தவறு நடந்தது.",
  },
  preview: {
    noRegions: "முக்கியமான பகுதிகள் எதுவும் கண்டறியப்படவில்லை",
    footer:
      "பிக்சல்கள் இந்த சாதனத்தில் நினைவகத்தில் மட்டுமே மறைக்கப்படுகின்றன. குறியிடப்பட்ட, மறைக்கப்பட்ட பகுதிகள் மட்டுமே தர்க்க சர்வருக்கு அனுப்பப்படும் — மூல மதிப்புகள் ஒருபோதும் இல்லை.",
  },
  audit: {
    title: "தனியுரிமை தணிக்கை பதிவு",
    subtitle: "இந்த அமர்வில் சாதனத்தில் மறைக்கப்பட்ட ஒவ்வொரு புலமும்",
    close: "மூடு",
    empty:
      "இதுவரை எந்த மறைப்பும் பதிவு செய்யப்படவில்லை. பணியின் போது V.A.R.M.A முக்கியமான புலங்களை மறைக்கும்போது இந்தப் பதிவு நிரம்பும்.",
    maskedMessage: "{domain} இல் 1 {tag} புலம் மறைக்கப்பட்டது",
  },
  tags: {
    CREDENTIAL: "நற்சான்று",
    COORDINATES: "புவிசார் ஆயத்தொலை",
    FACE: "முகம்",
    ID_NUMBER: "ID எண்",
    SIGNATURE: "கையொப்பம்",
  },
  notice: {
    title: "உங்கள் தரவு இந்த சாதனத்திலேயே இருக்கும்",
    body:
      "தர்க்க சர்வரை அடைவதற்கு முன் V.A.R.M.A முக்கியமான புலங்களை உள்ளூரில் மறைக்கிறது. இந்த அமர்வின் உரையாடல் வரலாறு மற்றும் மறைப்பு தணிக்கை பதிவு இந்த உலாவியில் மட்டுமே சேமிக்கப்படுகிறது — ஒருபோதும் எங்கும் அனுப்பப்படாது. இந்தப் பலகத்தை மீண்டும் திறக்கும்போது அந்த உள்ளூர் வரலாற்றை வைத்திருக்க ஏற்றுக்கொள்ளவும், அல்லது எல்லாவற்றையும் நினைவகத்தில் மட்டும் வைக்க மறுக்கவும், அது மூடியவுடன் அழிக்கப்படும்.",
    detailHeading: "இந்த உலாவியில் மட்டும், இந்த அமர்வுக்கு மட்டும் சேமிக்கப்பட்டவை",
    detailItem1: "உரையாடல் மற்றும் பணி வரலாறு",
    detailItem2: "மறைப்பு தணிக்கை பதிவு",
    detailItem3: "மொழி, ஒலி மற்றும் ஒப்புதல்-பயன்முறை விருப்பங்கள்",
    customize: "தனிப்பயனாக்கு",
    reject: "மறு",
    accept: "ஏற்றுக்கொள்",
  },
};

const te: Translations = {
  header: {
    auditLog: "గోప్యతా ఆడిట్ లాగ్",
    newSession: "కొత్త సెషన్",
    menu: "మరిన్ని",
    language: "భాష",
    mute: "శబ్దాన్ని మ్యూట్ చేయి",
    unmute: "శబ్దాన్ని ఆన్ చేయి",
    tabScope: "ట్యాబ్ యాక్సెస్ పరిధి",
    tabScopeSingle: "ప్రస్తుత ట్యాబ్ మాత్రమే",
    tabScopeAll: "అన్ని ట్యాబ్‌లు",
    visuals: "పేజీ దృశ్యాలు",
    visualsBoxes: "బౌండింగ్ బాక్స్‌లు",
    visualsCursor: "ఏజెంట్ కర్సర్",
    visualsRedact: "PII స్వయంగా మాస్క్ చేయి",
    on: "ఆన్",
    off: "ఆఫ్",  },
  context: {
    noActiveTab: "యాక్టివ్ ట్యాబ్ లేదు",
  },
  empty: {
    suggestion1: "ఫారమ్ సారాంశాన్ని శుభ్రం చేసి సంగ్రహించండి",
    suggestion2: "భువన్‌లో విపత్తు లేయర్‌లకు వెళ్లండి",
    suggestion3: "కనిపించే టెలిమెట్రీ ఫీల్డ్‌లను పరిశీలించి మాస్క్ చేయండి",
  },
  input: {
    placeholder: "ఈ పేజీలో ఒక పనిని చేయమని V.A.R.M.A ను అడగండి…",
    autoRedact: "ఆటో-రిడాక్ట్",
    mic: "వాయిస్ ఇన్‌పుట్",
    listening: "వింటోంది… ఆపడానికి నొక్కండి",
    approvalMode: "ఆమోద మోడ్",
  },
  approvalMenu: {
    manual: "మాన్యువల్‌గా ఆమోదించండి",
    auto: "స్వయంచాలకంగా ఆమోదించండి",
    skip: "అన్ని ఆమోదాలను దాటవేయండి",
  },
  card: {
    steps: "{n} దశలు",
    statusRunning: "నడుస్తోంది…",
    statusAwaitingApproval: "మీ ఆమోదం కోసం వేచి ఉంది",
    statusCompleted: "పూర్తయింది",
    statusDenied: "తిరస్కరించబడింది",
    statusStopped: "ఆపివేయబడింది",
    statusError: "లోపం",
  },
  steps: {
    capturingLabel: "వ్యూపోర్ట్ క్యాప్చర్ చేయబడుతోంది",
    capturingDetail: "{domain} యొక్క కనిపించే ప్రాంతం స్నాప్‌షాట్ తీయబడుతోంది",
    redactionLabel: "లోకల్ రిడాక్షన్",
    redactionDetailMasked: "క్యాప్చర్ పరికరాన్ని విడిచిపెట్టే ముందు {n} ఫీల్డ్‌లు మాస్క్ చేయబడ్డాయి",
    redactionDetailNone: "ప్రస్తుత వ్యూపోర్ట్‌లో సున్నితమైన ఫీల్డ్‌లు ఏవీ కనుగొనబడలేదు",
    reasoningLabel: "సర్వర్ రీజనింగ్",
    reasoningDetail: "శుభ్రపరచిన సందర్భం నుండి మాత్రమే యాక్షన్ పేలోడ్ రూపొందించబడుతోంది",
    actionLabel: "యాక్షన్",
    actionDetail: "పేజీలో సింథటిక్ ఇంటరాక్షన్ అమలు చేయబడుతోంది",
    showPreview: "శుభ్రపరచిన ప్రివ్యూను చూపించు",
    hidePreview: "శుభ్రపరచిన ప్రివ్యూను దాచు",
  },
  chips: {
    sanitizing: "DOM శుభ్రపరచబడుతోంది",
    reasoning: "సర్వర్ రీజనింగ్",
    executing: "యాక్షన్ అమలవుతోంది",
    completed: "పూర్తయింది",
  },
  approval: {
    actionLabel: "{domain} కు డేటాను సమర్పించండి",
    riskNote:
      "ఈ దశ గమ్యస్థాన సర్వర్‌కు డేటాను వ్రాస్తుంది మరియు స్వయంచాలకంగా రద్దు చేయబడదు. కొనసాగించే ముందు సమీక్షించండి.",
    approve: "యాక్షన్‌ను ఆమోదించండి",
    deny: "తిరస్కరించు",
    approvedNote: "ఆమోదించబడింది — యాక్షన్ అమలు చేయబడింది.",
    deniedNote: "తిరస్కరించబడింది — ఏమీ సమర్పించబడలేదు.",
    expiredNote: "నిర్ణయం తీసుకునే ముందే ఈ అభ్యర్థన సమయం ముగిసింది.",
    autoNote: "కొద్దిసేపట్లో స్వయంగా ఆమోదించబడుతుంది — ప్రతి దశను సమీక్షించడానికి మాన్యువల్ ఎంచుకోండి.",
    autoApprovedNote: "స్వయంగా ఆమోదించబడింది — యాక్షన్ అమలు చేయబడింది.",
    stepLabel: "దశ {n}",
    expiresIn: "{n}సెకన్లలో ముగుస్తుంది",
  },
  summary: {
    completedWithMasks:
      "పూర్తయింది — {n} ఫీల్డ్‌లు పరికరంలోనే ఉండిపోయాయి, యాక్షన్ శుభ్రపరచిన సందర్భంపై మాత్రమే అమలు చేయబడింది.",
    completedNoMasks: "పూర్తయింది — ఈ దశకు సున్నితమైన ఫీల్డ్‌లు ఏవీ పరిధిలో లేవు.",
    denied: "యాక్షన్ రద్దు చేయబడింది — ఏమీ సమర్పించబడలేదు.",
    stopped: "పని పూర్తయ్యేలోపు ఆపివేయబడింది.",
    error: "ఈ పని గురించి ఆలోచిస్తున్నప్పుడు ఏదో తప్పు జరిగింది.",
  },
  preview: {
    noRegions: "సున్నితమైన ప్రాంతాలు ఏవీ కనుగొనబడలేదు",
    footer:
      "పిక్సెల్‌లు ఈ పరికరంలో మెమరీలోనే మాస్క్ చేయబడతాయి. ట్యాగ్ చేయబడిన, రిడాక్ట్ చేయబడిన ప్రాంతాలు మాత్రమే రీజనింగ్ సర్వర్‌కు పంపబడతాయి — అసలు విలువలు ఎప్పుడూ కాదు.",
  },
  audit: {
    title: "గోప్యతా ఆడిట్ లాగ్",
    subtitle: "ఈ సెషన్‌లో పరికరంలో మాస్క్ చేయబడిన ప్రతి ఫీల్డ్",
    close: "మూసివేయి",
    empty:
      "ఇంకా ఎలాంటి రిడాక్షన్‌లు నమోదు కాలేదు. పని సమయంలో V.A.R.M.A సున్నితమైన ఫీల్డ్‌లను మాస్క్ చేసినప్పుడు ఈ లాగ్ నిండుతుంది.",
    maskedMessage: "{domain} లో 1 {tag} ఫీల్డ్ మాస్క్ చేయబడింది",
  },
  tags: {
    CREDENTIAL: "క్రెడెన్షియల్",
    COORDINATES: "జియోస్పేషియల్ కోఆర్డినేట్",
    FACE: "ముఖం",
    ID_NUMBER: "ID నంబర్",
    SIGNATURE: "సంతకం",
  },
  notice: {
    title: "మీ డేటా ఈ పరికరంలోనే ఉంటుంది",
    body:
      "రీజనింగ్ సర్వర్‌కు చేరుకునే ముందు V.A.R.M.A సున్నితమైన ఫీల్డ్‌లను స్థానికంగా రిడాక్ట్ చేస్తుంది. ఈ సెషన్ యొక్క సంభాషణ చరిత్ర మరియు రిడాక్షన్ ఆడిట్ లాగ్ ఈ బ్రౌజర్‌లో మాత్రమే నిల్వ చేయబడతాయి — ఎప్పుడూ ఎక్కడికీ పంపబడవు. ఈ ప్యానెల్‌ను మళ్లీ తెరిచినప్పుడు ఆ స్థానిక చరిత్రను ఉంచడానికి ఆమోదించండి, లేదా ప్రతిదీ మెమరీలో మాత్రమే ఉంచడానికి తిరస్కరించండి, అది మూసివేయగానే తొలగించబడుతుంది.",
    detailHeading: "ఈ బ్రౌజర్‌లో మాత్రమే, ఈ సెషన్‌కు మాత్రమే నిల్వ చేయబడింది",
    detailItem1: "సంభాషణ మరియు పని చరిత్ర",
    detailItem2: "రిడాక్షన్ ఆడిట్ లాగ్",
    detailItem3: "భాష, శబ్దం మరియు ఆమోద-మోడ్ ప్రాధాన్యతలు",
    customize: "అనుకూలీకరించండి",
    reject: "తిరస్కరించండి",
    accept: "ఆమోదించండి",
  },
};

const or_: Translations = {
  header: {
    auditLog: "ଗୋପନୀୟତା ଅଡିଟ୍ ଲଗ୍",
    newSession: "ନୂଆ ସେସନ୍",
    menu: "ଅଧିକ",
    language: "ଭାଷା",
    mute: "ଶବ୍ଦ ମ୍ୟୁଟ୍ କରନ୍ତୁ",
    unmute: "ଶବ୍ଦ ଚାଲୁ କରନ୍ତୁ",
    tabScope: "ଟ୍ୟାବ୍ ଆକ୍ସେସ୍ ସୀମା",
    tabScopeSingle: "କେବଳ ବର୍ତ୍ତମାନ ଟ୍ୟାବ୍",
    tabScopeAll: "ସମସ୍ତ ଟ୍ୟାବ୍",
    visuals: "ପୃଷ୍ଠା ଦୃଶ୍ୟ",
    visualsBoxes: "ବାଉଣ୍ଡିଂ ବକ୍ସ",
    visualsCursor: "ଏଜେଣ୍ଟ କର୍ସର",
    visualsRedact: "PII ସ୍ୱଚାଳିତ ମାସ୍କ",
    on: "ଚାଲୁ",
    off: "ବନ୍ଦ",  },
  context: {
    noActiveTab: "କୌଣସି ସକ୍ରିୟ ଟ୍ୟାବ୍ ନାହିଁ",
  },
  empty: {
    suggestion1: "ଫର୍ମ ସାରାଂଶ ସଫା କରି ବାହାର କରନ୍ତୁ",
    suggestion2: "ଭୁବନରେ ବିପର୍ଯ୍ୟୟ ସ୍ତର ମାନଙ୍କୁ ଯାଆନ୍ତୁ",
    suggestion3: "ଦୃଶ୍ୟମାନ ଟେଲିମେଟ୍ରି ଫିଲ୍ଡ ଯାଞ୍ଚ କରି ମାସ୍କ କରନ୍ତୁ",
  },
  input: {
    placeholder: "ଏହି ପୃଷ୍ଠାରେ ଏକ କାର୍ଯ୍ୟ କରିବାକୁ V.A.R.M.A କୁ କୁହନ୍ତୁ…",
    autoRedact: "ଅଟୋ-ରିଡାକ୍ଟ",
    mic: "ଭଏସ୍ ଇନପୁଟ୍",
    listening: "ଶୁଣୁଛି… ବନ୍ଦ କରିବାକୁ ଟାପ୍ କରନ୍ତୁ",
    approvalMode: "ଅନୁମୋଦନ ମୋଡ୍",
  },
  approvalMenu: {
    manual: "ମାନୁଆଲ୍ ଭାବେ ଅନୁମୋଦନ କରନ୍ତୁ",
    auto: "ସ୍ୱୟଂଚାଳିତ ଭାବେ ଅନୁମୋଦନ କରନ୍ତୁ",
    skip: "ସମସ୍ତ ଅନୁମୋଦନ ଛାଡ଼ନ୍ତୁ",
  },
  card: {
    steps: "{n} ପାହାଚ",
    statusRunning: "ଚାଲୁଅଛି…",
    statusAwaitingApproval: "ଆପଣଙ୍କ ଅନୁମୋଦନ ଅପେକ୍ଷାରେ",
    statusCompleted: "ସମ୍ପୂର୍ଣ୍ଣ",
    statusDenied: "ପ୍ରତ୍ୟାଖ୍ୟାନ କରାଗଲା",
    statusStopped: "ବନ୍ଦ କରାଗଲା",
    statusError: "ତ୍ରୁଟି",
  },
  steps: {
    capturingLabel: "ଭ୍ୟୁପୋର୍ଟ କ୍ୟାପଚର୍ ହେଉଛି",
    capturingDetail: "{domain} ର ଦୃଶ୍ୟମାନ କ୍ଷେତ୍ରର ସ୍ନାପସଟ୍ ନିଆଯାଉଛି",
    redactionLabel: "ସ୍ଥାନୀୟ ରିଡାକ୍ସନ୍",
    redactionDetailMasked: "କ୍ୟାପଚର୍ ଡିଭାଇସ୍ ଛାଡିବା ପୂର୍ବରୁ {n} ଫିଲ୍ଡ ମାସ୍କ କରାଗଲା",
    redactionDetailNone: "ବର୍ତ୍ତମାନର ଭ୍ୟୁପୋର୍ଟରେ କୌଣସି ସମ୍ବେଦନଶୀଳ ଫିଲ୍ଡ ମିଳିଲା ନାହିଁ",
    reasoningLabel: "ସର୍ଭର ରିଜନିଂ",
    reasoningDetail: "କେବଳ ସାନିଟାଇଜ୍ ହୋଇଥିବା ପ୍ରସଙ୍ଗରୁ ଆକ୍ସନ୍ ପେଲୋଡ୍ ତିଆରି ହେଉଛି",
    actionLabel: "ଆକ୍ସନ୍",
    actionDetail: "ପୃଷ୍ଠାରେ ସିନ୍ଥେଟିକ୍ ଇଣ୍ଟରାକ୍ସନ୍ ନିଷ୍ପାଦିତ ହେଉଛି",
    showPreview: "ସାନିଟାଇଜ୍ ହୋଇଥିବା ପ୍ରିଭ୍ୟୁ ଦେଖାନ୍ତୁ",
    hidePreview: "ସାନିଟାଇଜ୍ ହୋଇଥିବା ପ୍ରିଭ୍ୟୁ ଲୁଚାନ୍ତୁ",
  },
  chips: {
    sanitizing: "DOM ସାନିଟାଇଜ୍ ହେଉଛି",
    reasoning: "ସର୍ଭର ରିଜନିଂ",
    executing: "ଆକ୍ସନ୍ ନିଷ୍ପାଦିତ ହେଉଛି",
    completed: "ସମ୍ପୂର୍ଣ୍ଣ",
  },
  approval: {
    actionLabel: "{domain} କୁ ଡାଟା ଦାଖଲ କରନ୍ତୁ",
    riskNote:
      "ଏହି ପାହାଚ ଗନ୍ତବ୍ୟ ସର୍ଭରକୁ ଡାଟା ଲେଖେ ଏବଂ ସ୍ୱୟଂଚାଳିତ ଭାବେ ପଲଟାଯାଇପାରିବ ନାହିଁ। ଆଗକୁ ବଢିବା ପୂର୍ବରୁ ସମୀକ୍ଷା କରନ୍ତୁ।",
    approve: "ଆକ୍ସନ୍ ଅନୁମୋଦନ କରନ୍ତୁ",
    deny: "ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ",
    approvedNote: "ଅନୁମୋଦିତ — ଆକ୍ସନ୍ ନିଷ୍ପାଦିତ ହେଲା।",
    deniedNote: "ପ୍ରତ୍ୟାଖ୍ୟାନ କରାଗଲା — କିଛି ଦାଖଲ ହେଲା ନାହିଁ।",
    expiredNote: "ନିଷ୍ପତ୍ତି ନେବା ପୂର୍ବରୁ ଏହି ଅନୁରୋଧର ସମୟ ଶେଷ ହୋଇଗଲା।",
    autoNote: "କିଛି କ୍ଷଣରେ ସ୍ୱଚାଳିତ ଅନୁମୋଦନ — ପ୍ରତ୍ୟେକ ପଦକ୍ଷେପ ସମୀକ୍ଷା ପାଇଁ ମାନୁଆଲ୍ ବାଛନ୍ତୁ।",
    autoApprovedNote: "ସ୍ୱଚାଳିତ ଅନୁମୋଦିତ — ଆକ୍ସନ୍ ନିଷ୍ପାଦିତ ହେଲା।",
    stepLabel: "ପଦକ୍ଷେପ {n}",
    expiresIn: "{n}ସେକେଣ୍ଡରେ ଶେଷ ହେବ",
  },
  summary: {
    completedWithMasks:
      "ସମ୍ପୂର୍ଣ୍ଣ — {n} ଫିଲ୍ଡ ଡିଭାଇସରେ ହିଁ ରହିଲା, ଆକ୍ସନ୍ କେବଳ ସାନିଟାଇଜ୍ ହୋଇଥିବା ପ୍ରସଙ୍ଗରେ ନିଷ୍ପାଦିତ ହେଲା।",
    completedNoMasks: "ସମ୍ପୂର୍ଣ୍ଣ — ଏହି ପାହାଚ ପାଇଁ କୌଣସି ସମ୍ବେଦନଶୀଳ ଫିଲ୍ଡ ପରିସର ମଧ୍ୟରେ ନଥିଲା।",
    denied: "ଆକ୍ସନ୍ ବାତିଲ୍ ହେଲା — କିଛି ଦାଖଲ ହେଲା ନାହିଁ।",
    stopped: "କାର୍ଯ୍ୟ ସମ୍ପୂର୍ଣ୍ଣ ହେବା ପୂର୍ବରୁ ବନ୍ଦ କରାଗଲା।",
    error: "ଏହି କାର୍ଯ୍ୟ ବିଷୟରେ ଚିନ୍ତା କରିବା ସମୟରେ କିଛି ଭୁଲ ହେଲା।",
  },
  preview: {
    noRegions: "କୌଣସି ସମ୍ବେଦନଶୀଳ କ୍ଷେତ୍ର ମିଳିଲା ନାହିଁ",
    footer:
      "ପିକସେଲ୍ ଏହି ଡିଭାଇସରେ ମେମୋରୀରେ ହିଁ ମାସ୍କ ହୁଏ। କେବଳ ଟ୍ୟାଗ୍ ହୋଇଥିବା, ରିଡାକ୍ଟ ହୋଇଥିବା କ୍ଷେତ୍ର ହିଁ ରିଜନିଂ ସର୍ଭରକୁ ପଠାଯାଏ — କେବେହେଲେ ମୂଳ ମୂଲ୍ୟ ନୁହେଁ।",
  },
  audit: {
    title: "ଗୋପନୀୟତା ଅଡିଟ୍ ଲଗ୍",
    subtitle: "ଏହି ସେସନରେ ଡିଭାଇସରେ ମାସ୍କ ହୋଇଥିବା ପ୍ରତ୍ୟେକ ଫିଲ୍ଡ",
    close: "ବନ୍ଦ କରନ୍ତୁ",
    empty:
      "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ରିଡାକ୍ସନ୍ ରେକର୍ଡ ହୋଇନାହିଁ। କାର୍ଯ୍ୟ ସମୟରେ V.A.R.M.A ସମ୍ବେଦନଶୀଳ ଫିଲ୍ଡ ମାସ୍କ କରିବା ସହିତ ଏହି ଲଗ୍ ପୂର୍ଣ୍ଣ ହୁଏ।",
    maskedMessage: "{domain} ରେ 1 {tag} ଫିଲ୍ଡ ମାସ୍କ ହେଲା",
  },
  tags: {
    CREDENTIAL: "କ୍ରେଡେନ୍ସିଆଲ୍",
    COORDINATES: "ଭୌଗୋଳିକ ସଂଯୋଜକ",
    FACE: "ମୁହଁ",
    ID_NUMBER: "ID ନମ୍ବର",
    SIGNATURE: "ହସ୍ତାକ୍ଷର",
  },
  notice: {
    title: "ଆପଣଙ୍କ ଡାଟା ଏହି ଡିଭାଇସରେ ହିଁ ରହେ",
    body:
      "ରିଜନିଂ ସର୍ଭରରେ ପହଞ୍ଚିବା ପୂର୍ବରୁ V.A.R.M.A ସମ୍ବେଦନଶୀଳ ଫିଲ୍ଡକୁ ସ୍ଥାନୀୟ ଭାବେ ରିଡାକ୍ଟ କରେ। ଏହି ସେସନର ବାର୍ତ୍ତାଳାପ ଇତିହାସ ଏବଂ ରିଡାକ୍ସନ୍ ଅଡିଟ୍ ଲଗ୍ କେବଳ ଏହି ବ୍ରାଉଜରରେ ହିଁ ସଂରକ୍ଷିତ ହୁଏ — କେବେହେଲେ କୁଆଡେ ପଠାଯାଏ ନାହିଁ। ଏହି ପ୍ୟାନେଲ୍ ପୁଣି ଖୋଲିବାବେଳେ ସେହି ସ୍ଥାନୀୟ ଇତିହାସ ରଖିବାକୁ ଅନୁମୋଦନ କରନ୍ତୁ, କିମ୍ବା ସବୁକିଛି କେବଳ ମେମୋରୀରେ ରଖିବାକୁ ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ, ଯାହା ବନ୍ଦ ହେବା ମାତ୍ରେ ମିଳାଇଯିବ।",
    detailHeading: "କେବଳ ଏହି ବ୍ରାଉଜରରେ, କେବଳ ଏହି ସେସନ ପାଇଁ ସଂରକ୍ଷିତ",
    detailItem1: "ବାର୍ତ୍ତାଳାପ ଏବଂ କାର୍ଯ୍ୟ ଇତିହାସ",
    detailItem2: "ରିଡାକ୍ସନ୍ ଅଡିଟ୍ ଲଗ୍",
    detailItem3: "ଭାଷା, ଶବ୍ଦ ଏବଂ ଅନୁମୋଦନ-ମୋଡ୍ ପସନ୍ଦ",
    customize: "କଷ୍ଟମାଇଜ୍ କରନ୍ତୁ",
    reject: "ପ୍ରତ୍ୟାଖ୍ୟାନ କରନ୍ତୁ",
    accept: "ଗ୍ରହଣ କରନ୍ତୁ",
  },
};

const bn: Translations = {
  header: {
    auditLog: "গোপনীয়তা অডিট লগ",
    newSession: "নতুন সেশন",
    menu: "আরও",
    language: "ভাষা",
    mute: "শব্দ মিউট করুন",
    unmute: "শব্দ চালু করুন",
    tabScope: "ট্যাব অ্যাক্সেস সীমা",
    tabScopeSingle: "শুধু বর্তমান ট্যাব",
    tabScopeAll: "সব ট্যাব",
    visuals: "পৃষ্ঠার দৃশ্য",
    visualsBoxes: "বাউন্ডিং বক্স",
    visualsCursor: "এজেন্ট কার্সর",
    visualsRedact: "PII স্বয়ংক্রিয়ভাবে মাস্ক করুন",
    on: "চালু",
    off: "বন্ধ",  },
  context: {
    noActiveTab: "কোনো সক্রিয় ট্যাব নেই",
  },
  empty: {
    suggestion1: "ফর্ম সারাংশ পরিষ্কার করে বের করুন",
    suggestion2: "ভুবনে দুর্যোগ স্তরগুলিতে যান",
    suggestion3: "দৃশ্যমান টেলিমেট্রি ফিল্ড পরীক্ষা করে মাস্ক করুন",
  },
  input: {
    placeholder: "এই পৃষ্ঠায় একটি কাজ করতে V.A.R.M.A কে বলুন…",
    autoRedact: "অটো-রিড্যাক্ট",
    mic: "ভয়েস ইনপুট",
    listening: "শুনছে… থামাতে ট্যাপ করুন",
    approvalMode: "অনুমোদন মোড",
  },
  approvalMenu: {
    manual: "ম্যানুয়ালি অনুমোদন করুন",
    auto: "স্বয়ংক্রিয়ভাবে অনুমোদন করুন",
    skip: "সমস্ত অনুমোদন এড়িয়ে যান",
  },
  card: {
    steps: "{n}টি ধাপ",
    statusRunning: "চলছে…",
    statusAwaitingApproval: "আপনার অনুমোদনের অপেক্ষায়",
    statusCompleted: "সম্পন্ন",
    statusDenied: "প্রত্যাখ্যাত",
    statusStopped: "থামানো হয়েছে",
    statusError: "ত্রুটি",
  },
  steps: {
    capturingLabel: "ভিউপোর্ট ক্যাপচার করা হচ্ছে",
    capturingDetail: "{domain} এর দৃশ্যমান অংশের স্ন্যাপশট নেওয়া হচ্ছে",
    redactionLabel: "স্থানীয় রিড্যাকশন",
    redactionDetailMasked: "ক্যাপচার ডিভাইস ছাড়ার আগে {n}টি ফিল্ড মাস্ক করা হয়েছে",
    redactionDetailNone: "বর্তমান ভিউপোর্টে কোনো সংবেদনশীল ফিল্ড পাওয়া যায়নি",
    reasoningLabel: "সার্ভার রিজনিং",
    reasoningDetail: "শুধুমাত্র স্যানিটাইজড প্রসঙ্গ থেকে অ্যাকশন পেলোড তৈরি হচ্ছে",
    actionLabel: "অ্যাকশন",
    actionDetail: "পৃষ্ঠায় সিন্থেটিক ইন্টারঅ্যাকশন কার্যকর হচ্ছে",
    showPreview: "স্যানিটাইজড প্রিভিউ দেখান",
    hidePreview: "স্যানিটাইজড প্রিভিউ লুকান",
  },
  chips: {
    sanitizing: "DOM স্যানিটাইজ হচ্ছে",
    reasoning: "সার্ভার রিজনিং",
    executing: "অ্যাকশন কার্যকর হচ্ছে",
    completed: "সম্পন্ন",
  },
  approval: {
    actionLabel: "{domain} এ ডেটা জমা দিন",
    riskNote:
      "এই ধাপটি গন্তব্য সার্ভারে ডেটা লেখে এবং স্বয়ংক্রিয়ভাবে পূর্বাবস্থায় ফেরানো যায় না। এগিয়ে যাওয়ার আগে পর্যালোচনা করুন।",
    approve: "অ্যাকশন অনুমোদন করুন",
    deny: "প্রত্যাখ্যান করুন",
    approvedNote: "অনুমোদিত — অ্যাকশন কার্যকর হয়েছে।",
    deniedNote: "প্রত্যাখ্যাত — কিছুই জমা দেওয়া হয়নি।",
    expiredNote: "সিদ্ধান্ত নেওয়ার আগেই এই অনুরোধের সময় শেষ হয়ে গেছে।",
    autoNote: "কিছুক্ষণেই স্বয়ংক্রিয় অনুমোদন — প্রতিটি ধাপ পর্যালোচনার জন্য ম্যানুয়াল বেছে নিন।",
    autoApprovedNote: "স্বয়ংক্রিয়ভাবে অনুমোদিত — অ্যাকশন কার্যকর হয়েছে।",
    stepLabel: "ধাপ {n}",
    expiresIn: "{n}সেকেন্ডে শেষ হবে",
  },
  summary: {
    completedWithMasks:
      "সম্পন্ন — {n}টি ফিল্ড ডিভাইসেই রয়ে গেছে, অ্যাকশন শুধুমাত্র স্যানিটাইজড প্রসঙ্গে কার্যকর হয়েছে।",
    completedNoMasks: "সম্পন্ন — এই ধাপের জন্য কোনো সংবেদনশীল ফিল্ড পরিধির মধ্যে ছিল না।",
    denied: "অ্যাকশন বাতিল করা হয়েছে — কিছুই জমা দেওয়া হয়নি।",
    stopped: "কাজ সম্পূর্ণ হওয়ার আগে থামানো হয়েছে।",
    error: "এই কাজ নিয়ে চিন্তা করার সময় কিছু ভুল হয়েছে।",
  },
  preview: {
    noRegions: "কোনো সংবেদনশীল অঞ্চল পাওয়া যায়নি",
    footer:
      "পিক্সেলগুলি এই ডিভাইসে মেমরিতেই মাস্ক করা হয়। শুধুমাত্র ট্যাগ করা, রিড্যাক্ট করা অঞ্চলগুলি রিজনিং সার্ভারে পাঠানো হয় — কখনও মূল মান নয়।",
  },
  audit: {
    title: "গোপনীয়তা অডিট লগ",
    subtitle: "এই সেশনে ডিভাইসে মাস্ক করা প্রতিটি ফিল্ড",
    close: "বন্ধ করুন",
    empty:
      "এখনও কোনো রিড্যাকশন রেকর্ড করা হয়নি। কাজ চলাকালীন V.A.R.M.A যেমন সংবেদনশীল ফিল্ড মাস্ক করে তেমনি এই লগ পূর্ণ হয়।",
    maskedMessage: "{domain} এ 1টি {tag} ফিল্ড মাস্ক করা হয়েছে",
  },
  tags: {
    CREDENTIAL: "ক্রেডেনশিয়াল",
    COORDINATES: "ভৌগোলিক স্থানাঙ্ক",
    FACE: "মুখ",
    ID_NUMBER: "ID নম্বর",
    SIGNATURE: "স্বাক্ষর",
  },
  notice: {
    title: "আপনার ডেটা এই ডিভাইসেই থাকে",
    body:
      "রিজনিং সার্ভারে পৌঁছানোর আগে V.A.R.M.A সংবেদনশীল ফিল্ড স্থানীয়ভাবে রিড্যাক্ট করে। এই সেশনের কথোপকথনের ইতিহাস এবং রিড্যাকশন অডিট লগ শুধুমাত্র এই ব্রাউজারে সংরক্ষিত হয় — কখনও কোথাও পাঠানো হয় না। এই প্যানেলটি আবার খোলার সময় সেই স্থানীয় ইতিহাস রাখতে গ্রহণ করুন, অথবা সবকিছু শুধুমাত্র মেমরিতে রাখতে প্রত্যাখ্যান করুন, যা বন্ধ হওয়ার সাথে সাথেই মুছে যাবে।",
    detailHeading: "শুধুমাত্র এই ব্রাউজারে, শুধুমাত্র এই সেশনের জন্য সংরক্ষিত",
    detailItem1: "কথোপকথন এবং কাজের ইতিহাস",
    detailItem2: "রিড্যাকশন অডিট লগ",
    detailItem3: "ভাষা, শব্দ এবং অনুমোদন-মোড পছন্দসমূহ",
    customize: "কাস্টমাইজ করুন",
    reject: "প্রত্যাখ্যান করুন",
    accept: "গ্রহণ করুন",
  },
};

export const TRANSLATIONS: Record<LanguageCode, Translations> = {
  en,
  hi,
  gu,
  mr,
  kn,
  ml,
  ta,
  te,
  or: or_,
  bn,
};

export function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}
